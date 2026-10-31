"""
Evaluate PRs and merge the ones that have been eligible for an hour.

Both entry points run from the base checkout and never execute anything from a PR:
its head is read as git objects, its data as JSON. ``evaluate_pr`` collects every
fact fresh (proofs are re-fetched), scores the checklist and posts the ``Auto-merge``
check run. ``sweep`` does the same, at merge time, for every PR whose eligible record
is an hour old, then merges with the head SHA pinned so a push in between is refused.
"""

import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from ofd.automerge import record
from ofd.automerge.eligibility import Eligibility, Snapshot, evaluate
from ofd.automerge.proof import (
    NEW,
    PROVABLE,
    Leaf,
    classify,
    context_for,
    diff_leaves,
    verify_all,
    verify_finding,
)
from ofd.brand_claims import CLAIMS_FILE, brands_touched, load_claims
from ofd.enrich.verify import Fetcher
from ofd.review import github
from ofd.review.gitdata import TreeReader, changed_files, git
from ofd.review.jsonlines import resolve
from ofd.review.run import fetch_pr
from ofd.uuids import find_lost_uuids, iter_entities

# Kept identical to webui/src/lib/config/reviewMessages.ts (a test checks).
LGTM_MESSAGE = (
    "LGTM! Thanks for the contribution, it'll be up on SP and the dataset at about "
    "00:00 Danish time :D"
)
REVIEW_ARTIFACT = "ai-review-{pr}"


def log(message: str) -> None:
    print(message, file=sys.stderr)


def settings() -> dict:
    return {
        "mode": os.environ.get("OFD_AUTOMERGE", "off").strip().lower() or "off",
        "app_id": int(os.environ.get("OFD_AUTOMERGE_APP_ID") or 0),
        "has_token": bool(os.environ.get("GH_TOKEN"))
        and bool(os.environ.get("OFD_AUTOMERGE_APP_ID")),
        "blocked": {
            u.strip()
            for u in os.environ.get("OFD_AUTOMERGE_BLOCKED_USERS", "").replace(",", " ").split()
            if u.strip()
        },
    }


# --- facts ----------------------------------------------------------------------


def download_review(repo: str, number: int, head_sha: str) -> dict | None:
    """The newest ``ai-review-<PR>`` artifact's review.json, if it covers ``head_sha``."""
    name = REVIEW_ARTIFACT.format(pr=number)
    listing = github.api(f"repos/{repo}/actions/artifacts?name={name}&per_page=20") or {}
    artifacts = [a for a in listing.get("artifacts", []) if not a.get("expired")]
    for artifact in sorted(artifacts, key=lambda a: a["id"], reverse=True):
        proc = subprocess.run(
            ["gh", "api", f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"],
            capture_output=True,
        )
        if proc.returncode != 0:
            continue
        with zipfile.ZipFile(io.BytesIO(proc.stdout)) as archive:
            if "review.json" not in archive.namelist():
                continue
            review = json.loads(archive.read("review.json"))
        if review.get("head_sha") == head_sha:
            return review
    return None


def check_states(repo: str, sha: str) -> dict[str, str]:
    """Check-run and status name -> success | neutral | skipped | pending | failure."""
    states: dict[str, str] = {}
    runs = github.api(f"repos/{repo}/commits/{sha}/check-runs?per_page=100") or {}
    for run in runs.get("check_runs", []):
        if run.get("status") != "completed":
            state = "pending"
        else:
            state = run.get("conclusion") or "failure"
            if state not in ("success", "neutral", "skipped"):
                state = "failure"
        # The newest run of a name wins.
        states[run["name"]] = state
    combined = github.api(f"repos/{repo}/commits/{sha}/status?per_page=100") or {}
    for status in combined.get("statuses", []):
        state = status.get("state")
        states[status["context"]] = state if state in ("success", "pending") else "failure"
    return states


def ruleset_contexts(repo: str, branch: str) -> list[str]:
    try:
        rules = github.api(f"repos/{repo}/rules/branches/{branch}") or []
    except github.GitHubError:
        return []
    contexts = []
    for rule in rules:
        if rule.get("type") == "required_status_checks":
            for check in (rule.get("parameters") or {}).get("required_status_checks", []):
                contexts.append(check.get("context"))
    return [c for c in contexts if c]


def raw_diff(repo_dir: Path, base: str, head: str) -> list[tuple[str, str, str, str]]:
    rows = []
    for line in git(repo_dir, "diff", "--raw", "--no-renames", base, head).splitlines():
        meta, _, path = line.partition("\t")
        fields = meta.lstrip(":").split()
        if len(fields) >= 5:
            rows.append((fields[4][0], fields[0], fields[1], path))
    return rows


def _extract(repo_dir: Path, treeish: str, dest: Path) -> tuple[Path, Path]:
    """``data/`` and ``stores/`` as they are at ``treeish``, written under ``dest``."""
    archive = subprocess.run(
        ["git", "archive", "--format=tar", treeish, "data", "stores"],
        cwd=repo_dir,
        capture_output=True,
        check=True,
    )
    with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
        tar.extractall(dest, filter="data")
    return dest / "data", dest / "stores"


def merged_tree_errors(repo_dir: Path, main_ref: str, head: str) -> list[str]:
    """Validate the PR as merged onto main, using main's own validators (E19).

    The merged tree is a plain folder, not a git checkout, so UUID continuity is
    compared against main's tree extracted the same way rather than through
    ``ofd uuid continuity``, which needs the data to live in a repository.
    """
    proc = subprocess.run(
        ["git", "merge-tree", "--write-tree", main_ref, head],
        cwd=repo_dir,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return ["does not merge cleanly onto main"]
    tree = proc.stdout.split()[0]
    with tempfile.TemporaryDirectory(prefix="ofd-automerge-") as tmp:
        data, stores = _extract(repo_dir, tree, Path(tmp, "merged"))
        base_data, base_stores = _extract(repo_dir, main_ref, Path(tmp, "main"))
        dirs = ["--data-dir", str(data), "--stores-dir", str(stores)]
        errors = []
        for args in (["validate", *dirs], ["uuid", "check", "--allow-missing-uuids", *dirs]):
            run = subprocess.run(
                [sys.executable, "-m", "ofd", *args], cwd=repo_dir, capture_output=True, text=True
            )
            if run.returncode != 0:
                # stdout ends with the verdict; stderr only with progress lines.
                tail = (run.stdout.strip() or run.stderr.strip()).splitlines()[-1:] or ["failed"]
                errors.append(f"`ofd {' '.join(args[:2])}`: {tail[0][:200]}")
        lost = find_lost_uuids(iter_entities(base_data, base_stores), iter_entities(data, stores))
        if lost:
            errors.append(
                f"`ofd uuid continuity`: {len(lost)} UUID(s) on main no longer resolve, "
                f"e.g. {lost[0].raw_uuid} ({lost[0].entity_type})"
            )
    return errors


def collect(
    repo: str,
    repo_dir: Path,
    number: int,
    review: dict | None = None,
    at_merge: bool = False,
    previous: dict | None = None,
) -> tuple[Snapshot, dict]:
    """A fresh ``Snapshot`` and the proof verdicts behind it."""
    cfg = settings()
    pr = github.pull_request(repo, number)
    base, head, _history = fetch_pr(repo_dir, repo, pr)
    if review is None or review.get("head_sha") != head:
        review = download_review(repo, number, head)

    changes, _others = changed_files(repo_dir, base, head)
    leaves = [leaf for change in changes for leaf in diff_leaves(change)]
    base_tree = TreeReader(repo_dir, base)
    fetcher = Fetcher()
    model = (review or {}).get("model") or {}
    candidates = list(model.get("proofs") or [])
    candidates += [
        v["proof"] for v in ((review or {}).get("proofs") or {}).values() if v.get("proof")
    ]
    proofs = verify_all(
        candidates, leaves, fetcher, lambda leaf: context_for(leaf, base_tree), repo_dir / "stores"
    )

    by_path = {c.path: c for c in changes}
    finding_verdicts = []
    for finding in model.get("findings") or []:
        change = by_path.get(finding.get("path"))
        if not change or not isinstance(finding.get("evidence"), dict):
            continue
        try:
            head_value = resolve(change.after, finding.get("pointer") or "")
        except (KeyError, IndexError, TypeError, ValueError):
            head_value = None
        probe = Leaf(change.path, finding.get("pointer") or "", "modify", kind=change.kind)
        verdict = verify_finding(
            finding,
            head_value,
            change.kind,
            fetcher,
            context_for(probe, base_tree),
            repo_dir / "stores",
        )
        finding_verdicts.append({"path": change.path, "pointer": finding.get("pointer"), **verdict})

    diff = raw_diff(repo_dir, base, head)
    try:
        claims = load_claims(repo_dir / CLAIMS_FILE)
    except (OSError, ValueError):
        # Fail closed: an unreadable registry counts every touched brand as claimed.
        claims = dict.fromkeys(brands_touched([row[3] for row in diff]), ["registry unreadable"])

    main_ref = f"refs/ofd-review/{number}/base"
    snapshot = Snapshot(
        mode=cfg["mode"],
        has_token=cfg["has_token"],
        pr=pr,
        raw_diff=diff,
        review=review,
        leaves=leaves,
        proofs=proofs,
        finding_verdicts=finding_verdicts,
        claims=claims,
        checks=check_states(repo, head),
        ruleset_contexts=ruleset_contexts(repo, pr["base"]["ref"]),
        reviews=github.api_list(f"repos/{repo}/pulls/{number}/reviews?per_page=100"),
        blocked_users=cfg["blocked"],
    )
    if at_merge:
        snapshot.merged_tree_errors = merged_tree_errors(repo_dir, main_ref, head)
        snapshot.eligible_since = record.eligible_since(previous, head)
        snapshot.now = datetime.now(timezone.utc)
    return snapshot, proofs


# --- entry points -----------------------------------------------------------------


def evaluate_pr(
    repo: str, repo_dir: Path, number: int, review: dict | None, post: bool
) -> Eligibility:
    cfg = settings()
    snapshot, _proofs = collect(repo, repo_dir, number, review)
    result = evaluate(snapshot)
    # The head may have moved while proofs were fetched: then this record is stale.
    if github.pull_request(repo, number)["head"]["sha"] != result.head_sha:
        log(f"#{number}: superseded by a newer push; not recording")
        return result
    if post and cfg["mode"] in ("shadow", "on"):
        previous = record.latest(repo, result.head_sha, cfg["app_id"])
        record.write(repo, result, previous, cfg["mode"])
    for item in result.items:
        log(f"#{number}: {'ok ' if item.ok else 'NO '} {item.id} {item.detail}")
    return result


def _merge_reason(snapshot: Snapshot, repo_dir: Path) -> str:
    """One line for the LGTM comment: what made this PR safe to merge unseen."""
    kinds = [classify(leaf) for leaf in snapshot.leaves]
    provable = [leaf for leaf, kind in zip(snapshot.leaves, kinds, strict=True) if kind == PROVABLE]
    added = kinds.count(NEW)
    parts = []
    if added:
        parts.append(
            f"{added} new entr{'ies' if added != 1 else 'y'} passed the validators and the AI review"
        )
    if provable:
        site = context_for(provable[0], TreeReader(repo_dir, "HEAD")).brand_site
        site = site or "the brand's site"
        parts.append(f"every changed value was verified against {site}")
    return "; ".join(parts or ["every check passed"]) + "; see the Auto-merge check."


def _merge_one(repo: str, repo_dir: Path, pr: dict, cfg: dict, dry_run: bool) -> str:
    number, sha = pr["number"], pr["head"]["sha"]
    previous = record.latest(repo, sha, cfg["app_id"])
    if record.eligible_since(previous, sha) is None:
        return "not eligible"
    snapshot, _ = collect(repo, repo_dir, number, at_merge=True, previous=previous)
    result = evaluate(snapshot, at_merge=True)
    if not result.eligible:
        if not dry_run:
            record.write(repo, result, previous, cfg["mode"])
        return "no longer eligible: " + "; ".join(f"{i.id} {i.detail}" for i in result.failures)
    if cfg["mode"] != "on" or dry_run:
        return "would merge"

    # Last look: a push or a `hold` in the last few seconds still wins.
    fresh = github.pull_request(repo, number)
    labels = {label["name"] for label in fresh.get("labels", [])}
    if fresh["head"]["sha"] != sha or "hold" in labels:
        return "changed at the last moment"
    try:
        github.api(
            f"repos/{repo}/pulls/{number}/merge", "PUT", {"sha": sha, "merge_method": "merge"}
        )
    except github.GitHubError as exc:
        return f"GitHub refused the merge: {exc}"
    github.api(
        f"repos/{repo}/issues/{number}/comments",
        "POST",
        {"body": f"{LGTM_MESSAGE}\n\n<sub>Auto-merged: {_merge_reason(snapshot, repo_dir)}</sub>"},
    )
    return "merged"


def sweep(repo: str, repo_dir: Path, dry_run: bool = False) -> dict[int, str]:
    cfg = settings()
    if cfg["mode"] not in ("shadow", "on"):
        log("auto-merge is off")
        return {}
    outcome: dict[int, str] = {}
    for pr in github.api_list(f"repos/{repo}/pulls?state=open&per_page=100"):
        if pr.get("draft"):
            continue
        try:
            outcome[pr["number"]] = _merge_one(repo, repo_dir, pr, cfg, dry_run)
        except Exception as exc:  # one broken PR must not stop the sweep
            outcome[pr["number"]] = f"error: {exc}"
        if outcome[pr["number"]] != "not eligible":
            log(f"#{pr['number']}: {outcome[pr['number']]}")
    return outcome
