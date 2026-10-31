"""
End to end: fetch a PR, run the free tiers, optionally the model, and post.

``review()`` writes everything ``post()`` needs into one JSON document, so CI can run
the two as separate steps (and upload the document as an artifact), while a local
``ofd review run --pr N`` just prints what it would post.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path

from ofd.automerge.proof import context_for, diff_leaves, verify_finding
from ofd.automerge.proof import verify_all as verify_proofs
from ofd.brand_claims import CLAIMS_FILE, brands_touched, load_claims
from ofd.enrich.verify import Fetcher
from ofd.review import github
from ofd.review.checks import HINT, Finding, enrichment_gaps, run_checks
from ofd.review.context import build_context, values_section
from ofd.review.flipflop import detect
from ofd.review.gitdata import TreeReader, changed_files, git
from ofd.review.jsonlines import resolve
from ofd.review.model import DEFAULT_BUDGET_USD, DEFAULT_MODEL, ModelError, available, run_model
from ofd.review.render import (
    MARKER,
    extract_ai_section,
    inline_comments,
    parse_spend,
    summary,
    verdict_map,
)
from ofd.review.sources import SOURCES_PREFIX, collect_urls, commit_messages, fetch_sources
from ofd.review.sources import context_section as sources_section
from ofd.review.suggest import build_suggestions
from ofd.review.sustainability import (
    OVERRIDE_LABEL,
    STATUS_CONTEXT,
    Entry,
    Touch,
    brand_site,
    context_section,
    find_touches,
    gate,
    verify_all,
)
from ofd.review.triage import (
    clean_summary,
    filter_findings,
    proof_candidates,
    verify_enrichments,
)

# Every model pass on one PR together, across pushes (kept in the comment's
# SPEND_MARKER). Below MIN_PASS_USD left, a pass isn't worth starting.
PR_BUDGET_USD = float(os.environ.get("OFD_REVIEW_PR_BUDGET_USD", "6"))
MIN_PASS_USD = 0.10


def log(message: str) -> None:
    print(message, file=sys.stderr)


def fetch_pr(repo_dir: Path, repo: str, pr: dict) -> tuple[str, str, str]:
    """Fetch the PR head and its base branch; returns (merge base, head, history ref).

    The history ref is what the flip-flop scan walks: the base branch as it is now, so
    a stale branch that writes back values fixed on main since it forked is caught
    (#183 put Geeetech's template temperatures back that way). Once merged, the base
    branch contains the PR itself, so it falls back to the base as the PR saw it.
    """
    number = pr["number"]
    git(
        repo_dir,
        "fetch",
        "--no-tags",
        "--quiet",
        f"https://github.com/{repo}.git",
        f"+refs/pull/{number}/head:refs/ofd-review/{number}/head",
        f"+refs/heads/{pr['base']['ref']}:refs/ofd-review/{number}/base",
    )
    head = pr["head"]["sha"]
    # base.sha rather than the branch tip: once merged, the head is an ancestor of the
    # tip, and a merge base with it would be the head itself.
    merge_base = git(repo_dir, "merge-base", pr["base"]["sha"], head).strip()
    history = pr["base"]["sha"] if pr.get("merged") else f"refs/ofd-review/{number}/base"
    return merge_base, head, history


@contextmanager
def head_worktree(repo_dir: Path, head: str):
    """A detached, throwaway checkout of the head for the model's read-only tools."""
    with tempfile.TemporaryDirectory(prefix="ofd-review-") as tmp:
        path = Path(tmp) / "head"
        git(repo_dir, "worktree", "add", "--detach", "--quiet", str(path), head)
        try:
            yield path
        finally:
            subprocess.run(
                ["git", "worktree", "remove", "--force", str(path)],
                cwd=repo_dir,
                capture_output=True,
            )


def review(
    repo_dir: Path,
    repo: str,
    number: int,
    ai: str = "always",
    model: str = DEFAULT_MODEL,
    budget_usd: float = DEFAULT_BUDGET_USD,
    head_dir: Path | None = None,
    carry_from: str | None = None,
) -> dict:
    """Review one PR.

    ``ai`` is ``always``, ``never`` or ``auto`` (only when the PR touches sustainability
    data). Whatever it says, sustainability changes are always verified against their
    sources, and the ``Sustainability sources`` gate fails unless the model also checked
    them, so ``never`` on such a PR yields a failing gate rather than a silent pass.

    ``carry_from`` is a reviewed commit whose model pass still applies because the new
    commits only apply its suggestions (``ofd.review.applied``): its AI review is
    carried forward instead of running the model again.
    """
    pr = github.pull_request(repo, number)
    base, head, history = fetch_pr(repo_dir, repo, pr)
    log(f"#{number}: reviewing {base[:7]}..{head[:7]}")

    changes, others = changed_files(repo_dir, base, head)
    all_paths = git(repo_dir, "diff", "--name-only", "--no-renames", base, head).splitlines()
    base_tree, head_tree = TreeReader(repo_dir, base), TreeReader(repo_dir, head)
    findings = run_checks(changes, base_tree, head_tree)
    hints = [f for f in findings if f.level == HINT]
    findings = [f for f in findings if f.level != HINT]
    flipflops = detect(repo_dir, history, changes)

    touch = find_touches(changes, all_paths)
    fetcher = Fetcher()
    verify_all(touch, head_tree, fetcher)
    leaves = [leaf for change in changes for leaf in diff_leaves(change)]
    log(
        f"#{number}: {len(changes)} files, {len(findings)} findings, {len(flipflops)} flip-flops, "
        f"{len(touch.entries)} sustainability entries"
    )

    result: dict = {
        "pr": number,
        "repo": repo,
        "base_sha": base,
        "head_sha": head,
        "labels": [label["name"] for label in pr.get("labels", [])],
        # Any data/ or stores/ change gets a comment, logos included.
        "has_data": any(p.startswith(("data/", "stores/")) for p in all_paths),
        "findings": [f.to_dict() for f in findings],
        "hints": [f.to_dict() for f in hints],
        "flipflops": [ff.to_dict() for ff in flipflops],
        "sustainability": {
            "touched": touch.any,
            "entries": [e.to_dict() for e in touch.entries],
            "removed": [e.to_dict() for e in touch.removed],
            "traits": touch.traits,
            "rule_paths": touch.rule_paths,
            "log_changed": touch.log_changed,
        },
        "claimed_brands": claimed_brands(repo_dir, all_paths),
        "model": None,
        "comments": [],
        "spent_usd": previous_spend(repo, number),
        "leaves": [leaf.to_dict() for leaf in leaves],
        "proofs": {},
        "finding_verdicts": [],
        "superseded": False,
        "sources": [],
    }
    use_model = ai == "always" or (ai == "auto" and touch.any)
    remaining = PR_BUDGET_USD - result["spent_usd"]
    if carry_from and not touch.any:
        _carry(result, carry_from, changes, leaves, fetcher, base_tree, repo_dir)
    elif use_model and (changes or touch.any) and head_moved(repo, number, head):
        result["superseded"] = True
        log(f"#{number}: the head moved on; skipping the model pass, the new head's run does it")
    elif use_model and (changes or touch.any) and remaining < MIN_PASS_USD:
        result["model"] = {
            "error": f"this PR has used its ${PR_BUDGET_USD:.2f} review budget; "
            "a maintainer can raise OFD_REVIEW_PR_BUDGET_USD"
        }
    elif use_model and (changes or touch.any):
        _model_pass(
            result,
            repo_dir,
            pr,
            head,
            changes,
            others,
            findings,
            flipflops,
            touch,
            model,
            min(budget_usd, remaining),
            head_dir,
            leaves=leaves,
            fetcher=fetcher,
            base_tree=base_tree,
            head_tree=head_tree,
        )
        result["spent_usd"] += (result["model"] or {}).get("cost_usd", 0)
    result["sustainability"]["gate"] = gate(touch, result["model"])
    return result


# What a carried-forward review keeps from the reviewed commit's result.
CARRIED_KEYS = ("not_placed", "suggestion_count", "suggestions", "manual", "rejected", "sources")


def _carry(result, sha, changes, leaves, fetcher, base_tree, repo_dir) -> None:
    """Reuse the model pass of ``sha`` for this head, re-checking its claims here."""
    from ofd.automerge.merge import download_review

    number = result["pr"]
    try:
        previous = download_review(result["repo"], number, sha)
    except github.GitHubError as exc:
        previous = None
        log(f"#{number}: {exc}")
    model = (previous or {}).get("model") or {}
    if not model or model.get("error"):
        log(f"#{number}: no completed review of {sha[:7]} to carry forward")
        return
    reviewed = model.get("carried_from") or previous["head_sha"]
    result["model"] = {**model, "cost_usd": 0, "carried_from": reviewed}
    result.update({k: previous[k] for k in CARRIED_KEYS if k in previous})
    # The applied suggestions are values the model sourced; offering them as proofs
    # lets a script prove them now that they are in the PR.
    claims = {
        "findings": model.get("findings", []),
        "proofs": model.get("proofs", []) + proof_candidates(model.get("enrichments", [])),
    }
    _check_model_claims(result, claims, changes, leaves, fetcher, base_tree, repo_dir)
    log(f"#{number}: carried the AI review of {reviewed[:7]} forward")


def head_moved(repo: str, number: int, head: str) -> bool:
    try:
        return github.pull_request(repo, number)["head"]["sha"] != head
    except github.GitHubError:
        return False


def previous_spend(repo: str, number: int) -> float:
    """Model spend on this PR so far, from the hidden marker in the bot's comment."""
    try:
        comment = github.find_marker_comment(repo, number, MARKER)
    except github.GitHubError:
        return 0.0
    return parse_spend((comment or {}).get("body", ""))


def _check_model_claims(result, ai, changes, leaves, fetcher, base_tree, repo_dir) -> list[dict]:
    """Script verdicts on the model's proofs and "this value is wrong" findings.

    Nothing the model says counts until a script has re-fetched the source: proofs go
    through ``ofd.automerge.proof.verify_all``, and a finding with ``evidence`` is a
    verified contradiction only if ``verify_finding`` proves the other value. Those
    come back as fix suggestions (``{path, pointer, value, source_url, ...}``).
    """
    if base_tree is None or fetcher is None:
        return []
    stores = repo_dir / "stores"

    def ctx_for(leaf):
        return context_for(leaf, base_tree)

    result["proofs"] = verify_proofs(ai.get("proofs", []), list(leaves), fetcher, ctx_for, stores)

    by_key = {(leaf.path, leaf.pointer): leaf for leaf in leaves}
    by_path = {c.path: c for c in changes}
    fixes: list[dict] = []
    for finding in ai.get("findings", []):
        if not finding.get("evidence"):
            continue
        path, pointer = finding.get("path"), finding.get("pointer") or ""
        leaf = by_key.get((path, pointer))
        change = by_path.get(path)
        try:
            head_value = (
                resolve(change.after, pointer) if change and change.after is not None else None
            )
        except (KeyError, IndexError, TypeError, ValueError):
            head_value = None
        kind = change.kind if change else ""
        ctx = context_for(leaf, base_tree) if leaf else None
        if leaf is None or ctx is None:
            verdict = {"verdict": "unverified", "reason": "not a value this PR changes"}
        else:
            verdict = verify_finding(finding, head_value, kind, fetcher, ctx, stores)
        result["finding_verdicts"].append({"path": path, "pointer": pointer, **verdict})
        if verdict["verdict"] == "verified":
            evidence = finding["evidence"]
            fixes.append(
                {
                    "path": path,
                    "pointer": pointer,
                    "value": evidence["value"],
                    "source_url": evidence["source_url"],
                    "confidence": "high",
                    "note": "the brand's page contradicts the submitted value",
                }
            )
    return fixes


def claimed_brands(repo_dir: Path, paths: list[str]) -> dict[str, list[str]]:
    """Claimed brands (ofd/brand_claims.json, read from the trusted checkout) this PR touches."""
    try:
        claims = load_claims(repo_dir / CLAIMS_FILE)
    except (OSError, ValueError):
        return {}
    return {b: claims[b] for b in sorted(brands_touched(paths)) if b in claims}


def gate_from_result(result: dict, override: str | None = None) -> dict:
    """Recompute the gate from a saved result (``ofd review post`` runs separately)."""
    sus = result["sustainability"]
    touch = Touch(
        entries=[Entry(**e) for e in sus["entries"]],
        removed=[Entry(**e) for e in sus["removed"]],
        traits=sus["traits"],
        rule_paths=sus["rule_paths"],
        log_changed=sus["log_changed"],
    )
    return gate(touch, result.get("model"), override)


def _fetch_sources(result, repo_dir, pr, changes, out_dir, workdir, fetcher, trees) -> list:
    """Fetch the PR's sources into ``out_dir`` and record them in ``result["sources"]``.

    Brand websites come from the PR's head first, so a new brand's shop links count;
    this only decides what the model gets to read, never what counts as proof.
    """
    brands = {c.path.split("/")[1] for c in changes if c.path.count("/") >= 1}
    sites = {
        b: next((site for t in trees if t and (site := brand_site(t, f"data/{b}/x"))), None)
        for b in brands
    }
    urls = collect_urls(
        pr.get("body") or "",
        commit_messages(repo_dir, result["base_sha"], result["head_sha"]),
        changes,
        sites,
    )
    sources = fetch_sources(urls, out_dir, workdir, fetcher or Fetcher())
    result["sources"] = [s.to_dict() for s in sources]
    unread = sum(1 for s in sources if not s.ok)
    log(f"#{result['pr']}: {len(sources)} sources fetched for the model, {unread} unreadable")
    return sources


def _model_pass(
    result,
    repo_dir,
    pr,
    head,
    changes,
    others,
    findings,
    flipflops,
    touch,
    model,
    budget_usd,
    head_dir,
    leaves=(),
    fetcher=None,
    base_tree=None,
    head_tree=None,
) -> None:
    number = result["pr"]
    if not available():
        result["model"] = {"error": "the `claude` CLI is not installed"}
        return

    hints = [Finding(**h) for h in result.get("hints", [])]
    context = build_context(
        pr, changes, others, findings, flipflops, enrichment_gaps(changes), hints
    )
    context += "\n" + values_section(leaves)
    context += "\n" + context_section(touch)
    if result["claimed_brands"]:
        context += (
            "\n## Claimed brands\n\n"
            + "\n".join(
                f"- `{brand}`: represented by {', '.join('@' + r for r in reps)}"
                + (" (this PR's author is a representative)" if pr["user"]["login"] in reps else "")
                for brand, reps in result["claimed_brands"].items()
            )
            + "\n"
        )

    def run_in(workdir: Path):
        # A fresh, unguessable folder: a PR can't plant files the model would take for
        # fetched sources, and nothing is left behind in a --head-dir checkout.
        out_dir = Path(tempfile.mkdtemp(prefix=SOURCES_PREFIX, dir=workdir))
        try:
            sources = _fetch_sources(
                result, repo_dir, pr, changes, out_dir, workdir, fetcher, (head_tree, base_tree)
            )
            return run_model(context + "\n" + sources_section(sources), workdir, model, budget_usd)
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)

    try:
        if head_dir:
            model_result = run_in(Path(head_dir))
        else:
            with head_worktree(repo_dir, head) as path:
                model_result = run_in(path)
    except ModelError as exc:
        log(f"#{number}: {exc}")
        result["model"] = {"error": str(exc)}
        return

    ai = model_result.review
    fixes = _check_model_claims(result, ai, changes, leaves, fetcher, base_tree, repo_dir)
    kept, dropped = filter_findings(ai.get("findings", []), changes)
    ai = {**ai, "findings": kept, "summary": clean_summary(ai.get("summary", ""))}
    enrichments, unverified = verify_enrichments(
        ai.get("enrichments", []), fetcher or Fetcher(), repo_dir / "stores"
    )
    outcome = build_suggestions(enrichments + fixes, changes)
    outcome.rejected = unverified + outcome.rejected
    comments, not_placed = inline_comments(ai, outcome, changes, verdict_map(result))
    result.update(
        model={
            "model": model_result.model,
            "cost_usd": model_result.cost_usd,
            "summary": ai.get("summary", ""),
            "findings": ai.get("findings", []),
            "enrichments": ai.get("enrichments", []),
            "sustainability": ai.get("sustainability"),
            "proofs": ai.get("proofs", []),
        },
        dropped_findings=dropped,
        comments=comments,
        not_placed=not_placed,
        suggestion_count=len(outcome.suggestions),
        suggestions=[asdict(s) for s in outcome.suggestions],
        manual=outcome.manual,
        rejected=outcome.rejected,
    )
    log(
        f"#{number}: model ${model_result.cost_usd:.2f}, {len(kept)} findings "
        f"({len(dropped)} dropped), "
        f"{len(outcome.suggestions)} suggestions, {len(outcome.rejected)} rejected"
    )


def merge_url(number: int) -> str:
    base = os.environ.get("OFD_WEBUI_URL", "").rstrip("/")
    return f"{base}/review/merge/{number}" if base else ""


def run_url() -> str:
    server, repo, run = (
        os.environ.get(k) for k in ("GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID")
    )
    return f"{server}/{repo}/actions/runs/{run}" if server and repo and run else ""


def render(result: dict, previous_body: str = "") -> str:
    return summary(
        result,
        previous_ai=extract_ai_section(previous_body),
        run_url=run_url(),
        merge_url=merge_url(result["pr"]),
    )


def resolve_override(repo: str, result: dict, drop: bool) -> str | None:
    """The maintainer behind a valid ``sustainability-verified`` label, if any.

    ``drop`` (set by the workflow on pushes) removes the label when the PR touches
    sustainability data, so an override never carries over to commits nobody checked.
    """
    if OVERRIDE_LABEL not in result.get("labels", []):
        return None
    number = result["pr"]
    if drop and result["sustainability"]["touched"]:
        github.remove_label(repo, number, OVERRIDE_LABEL)
        log(f"#{number}: new commits touch sustainability data; removed `{OVERRIDE_LABEL}`")
        return None
    actor = github.last_labeler(repo, number, OVERRIDE_LABEL)
    if not actor or not github.can_write(repo, actor):
        log(f"#{number}: `{OVERRIDE_LABEL}` was not added by a maintainer; ignoring it")
        return None
    return f"@{actor}"


def post(repo: str, result: dict, drop_override: bool = False) -> int:
    """Post the comment, inline review and gate status. Returns 1 if the gate fails."""
    number = result["pr"]
    sus = result["sustainability"]
    # A review of a commit that is no longer the head leaves no trace: the run for the
    # new head posts its own pending status and review.
    if result.get("superseded") or head_moved(repo, number, result["head_sha"]):
        log(f"#{number}: superseded by a newer push; posting nothing")
        return 0
    override = resolve_override(repo, result, drop_override)
    sus["gate"] = gate_from_result(result, override)

    # A push can still land between here and the comment; the status describes the
    # reviewed commit either way, and the new head's run posts its own.
    github.set_status(
        repo,
        result["head_sha"],
        STATUS_CONTEXT,
        sus["gate"]["state"],
        sus["gate"]["description"],
        run_url(),
    )
    current = github.pull_request(repo, number)
    if current["head"]["sha"] != result["head_sha"]:
        log(
            f"#{number}: head moved to {current['head']['sha'][:7]} during the review; not commenting"
        )
        return 1 if sus["gate"]["state"] != "success" else 0

    existing = github.find_marker_comment(repo, number, MARKER)
    if result.get("has_data") or sus["touched"] or existing:
        github.upsert_comment(
            repo, number, existing, render(result, (existing or {}).get("body", ""))
        )

    if result.get("comments"):
        try:
            github.create_review(
                repo,
                number,
                result["head_sha"],
                "AI review: see the summary comment.",
                result["comments"],
            )
        except github.GitHubError as exc:
            # A line GitHub won't accept rejects the whole review; the summary still stands.
            log(f"#{number}: inline review rejected: {exc}")
    return 1 if sus["gate"]["state"] != "success" else 0
