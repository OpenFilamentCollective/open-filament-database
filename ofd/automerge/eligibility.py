"""
Whether a PR may merge without a maintainer: the E1-E22 checklist.

The bar depends on what the PR does. New data (whole new files, appended spool
rows) only has to pass the validators and the AI review without a 🔴 finding.
Changes to existing values must each be proven against the brand's site. Deletions,
renames and anything structural always wait for a maintainer.

``evaluate(snapshot)`` is pure: it decides only from facts the script collected or
verified itself, never from the model's opinion. ``collect()`` gathers those facts
fresh from GitHub and git. Every condition is listed, in order, in the record and
the PR comment, so "why didn't this merge?" always has an answer.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime

from ofd.automerge.proof import HUMAN, NEW, PROVABLE, classify
from ofd.brand_claims import brands_touched, latest_review_states

HOLD_LABEL = "hold"
OVERRIDE_LABELS = (
    "sustainability-verified",
    "uuid-removal-ok",
    "brand-signoff-waived",
    "ai-review",
)
MAX_FILES = 25
MAX_LEAVES = 40
DELAY_MINUTES = 60

# Only these files can change: an existing filament, colour or spool list.
_DATA_PATH = re.compile(
    r"^data/[^/]+/[^/]+/[^/]+/(?:filament\.json|[^/]+/(?:variant|sizes)\.json)$"
)
# Any new file under these may be added: brands, materials, filaments, colours,
# spools, stores and their logos. The validators check what they are.
_NEW_PATH = re.compile(r"^(?:data|stores)/")

# Required on top of whatever the ruleset requires: a missing one fails, too. Not the
# "AI review" job's own check: a re-review started by hand or by `/review` reports it on
# main, not on the PR's head. E3 and E13 already require a completed review of the head,
# and a failing "AI review" run on the head still blocks through E16's "others".
REQUIRED_CONTEXTS = (
    "Brand sign-off",
    "Sustainability sources",
    "Validate data - json-files",
    "Validate data - folder-names",
    "Validate data - store-ids",
    "Validate data - logo-files",
    "Validate data - fiber-consistency",
    "Validate data - data-quality",
    "Validate data - uuids",
    "Validate data - uuid continuity",
)
SELF_CONTEXT = "Auto-merge"


@dataclass
class Snapshot:
    """Everything ``evaluate`` looks at, collected fresh. See ``collect``."""

    mode: str  # vars.OFD_AUTOMERGE: off, shadow or on
    has_token: bool
    pr: dict  # GET /pulls/{n}
    raw_diff: list[tuple[str, str, str, str]]  # (status, old mode, new mode, path)
    review: dict | None  # ai-review-<PR>/review.json
    leaves: list  # proof.Leaf for every changed value
    proofs: dict  # proof.verify_all output, fetched in this evaluation
    finding_verdicts: list[dict]  # proof.verify_finding output, fetched in this evaluation
    claims: dict[str, list[str]]  # from the base checkout
    checks: dict[str, str]  # context/check name -> "success" | "pending" | "failure" | ...
    ruleset_contexts: list[str]
    reviews: list[dict]  # GET /pulls/{n}/reviews
    blocked_users: set[str] = field(default_factory=set)
    # Merge-time only.
    merged_tree_errors: list[str] | None = None
    eligible_since: datetime | None = None
    now: datetime | None = None


@dataclass
class Item:
    id: str
    ok: bool
    detail: str


@dataclass
class Eligibility:
    eligible: bool
    head_sha: str
    items: list[Item]

    @property
    def failures(self) -> list[Item]:
        return [i for i in self.items if not i.ok]


def _labels(pr: dict) -> set[str]:
    return {label.get("name", "") for label in pr.get("labels", [])}


def _changes_requested(reviews: list[dict]) -> list[str]:
    return [
        u for u, r in latest_review_states(reviews).items() if r.get("state") == "CHANGES_REQUESTED"
    ]


def evaluate(s: Snapshot, at_merge: bool = False) -> Eligibility:
    head = s.pr.get("head", {}).get("sha", "")
    review = s.review or {}
    items: list[Item] = []

    def check(id_: str, ok: bool, detail: str) -> None:
        items.append(Item(id_, bool(ok), detail))

    check("E1", s.mode in ("shadow", "on") and s.has_token, f"auto-merge is {s.mode}")
    check(
        "E2",
        s.pr.get("state") == "open"
        and not s.pr.get("draft")
        and s.pr.get("base", {}).get("ref")
        == s.pr.get("base", {}).get("repo", {}).get("default_branch", "main"),
        "open, ready for review, against main",
    )
    check(
        "E3", head and review.get("head_sha") == head, "the review covers the current head commit"
    )
    labels = _labels(s.pr)
    check("E4", HOLD_LABEL not in labels, f"no `{HOLD_LABEL}` label")
    overrides = sorted(labels & set(OVERRIDE_LABELS))
    check(
        "E5",
        not overrides,
        "no override labels" if not overrides else f"labelled {', '.join(overrides)}",
    )

    paths = [row[3] for row in s.raw_diff]
    outside = [
        r[3]
        for r in s.raw_diff
        if not (_DATA_PATH.match(r[3]) or (r[0] == "A" and _NEW_PATH.match(r[3])))
    ]
    check(
        "E6",
        paths and not outside,
        "only data files" if not outside else f"also changes {outside[0]}",
    )
    odd = [
        r
        for r in s.raw_diff
        if not (r[0] == "M" and r[1] == r[2] == "100644" or r[0] == "A" and r[2] == "100644")
    ]
    check(
        "E7",
        not odd,
        "only additions and edits" if not odd else f"{odd[0][3]} is removed, renamed or re-moded",
    )
    brands = brands_touched(paths)
    check(
        "E8",
        len(paths) <= MAX_FILES and len(s.leaves) <= MAX_LEAVES and len(brands) <= 1,
        f"{len(paths)} files, {len(s.leaves)} values, {len(brands)} brand(s)",
    )
    items += content_items(
        review,
        s.leaves,
        s.proofs,
        s.finding_verdicts,
        claimed=sorted(brands & set(s.claims)),
        gate_green=s.checks.get("Sustainability sources") == "success",
        has_changes=bool(s.leaves or paths),
    )
    required = sorted(set(s.ruleset_contexts) | set(REQUIRED_CONTEXTS))
    not_green = [c for c in required if s.checks.get(c) != "success"]
    others = [
        c
        for c, state in s.checks.items()
        if c != SELF_CONTEXT and state not in ("success", "neutral", "skipped")
    ]
    bad = sorted(set(not_green) | set(others))
    check("E16", not bad, "all checks green" if not bad else f"not green: {', '.join(bad[:4])}")
    blockers = _changes_requested(s.reviews)
    check(
        "E17",
        not blockers,
        "no changes requested" if not blockers else f"changes requested by {blockers[0]}",
    )
    check("E18", s.pr.get("mergeable") is True, f"mergeable: {s.pr.get('mergeable')}")
    if at_merge:
        errors = s.merged_tree_errors
        check(
            "E19",
            errors == [],
            "validators pass on the merged tree"
            if errors == []
            else f"merged tree: {(errors or ['not checked'])[0]}",
        )
        waited = (
            s.eligible_since is not None
            and s.now is not None
            and (s.now - s.eligible_since).total_seconds() >= DELAY_MINUTES * 60
        )
        check("E20", waited, f"eligible since {s.eligible_since}")
    author = (s.pr.get("user") or {}).get("login", "")
    check("E21", author.lower() not in {u.lower() for u in s.blocked_users}, f"author {author}")

    items.sort(key=lambda i: int(i.id[1:]))
    return Eligibility(all(i.ok for i in items), head, items)


def content_items(
    review: dict,
    leaves: list,
    proofs: dict,
    finding_verdicts: list[dict],
    claimed: list[str],
    gate_green: bool,
    has_changes: bool = True,
) -> list[Item]:
    """E9-E15 and E22: what the PR's content and its review say, without GitHub state.

    Shared with the review comment (``ofd.review.render``), so the line it shows about
    auto-merge can't drift from what this checklist decides.
    """
    items: list[Item] = []

    def check(id_: str, ok: bool, detail: str) -> None:
        items.append(Item(id_, bool(ok), detail))

    kinds = [classify(leaf) for leaf in leaves]
    human = [leaf for leaf, kind in zip(leaves, kinds, strict=True) if kind == HUMAN]
    check(
        "E9",
        has_changes and not human,
        "every change is new data or can be proven"
        if not human
        else f"{len(human)} change(s) to existing data need a maintainer, e.g. "
        f"`{human[0].path}` `{human[0].pointer or '(whole file)'}`",
    )
    unproven = [k for k, v in proofs.items() if not v.get("ok")]
    missing = [
        leaf.key
        for leaf, kind in zip(leaves, kinds, strict=True)
        if kind == PROVABLE and leaf.key not in proofs
    ]
    check(
        "E10",
        not unproven and not missing,
        "every changed value is proven by the brand's site"
        if not unproven and not missing
        else f"{len(unproven) + len(missing)} changed value(s) unproven",
    )
    contradictions = [v for v in finding_verdicts if v.get("verdict") == "verified"]
    check("E11", not contradictions, f"{len(contradictions)} proven contradiction(s)")
    serious = [f for f in review.get("findings", []) if f.get("level") in ("error", "warning")]
    flips = review.get("flipflops", [])
    check(
        "E12",
        not serious and not flips,
        f"{len(serious)} check finding(s), {len(flips)} flip-flop(s)",
    )
    model = review.get("model") or {}
    done = bool(model) and not model.get("error")
    check(
        "E13",
        done,
        "the AI pass completed on this commit" if done else "no completed AI review of this commit",
    )
    check(
        "E14",
        not claimed,
        "brand not claimed" if not claimed else f"{claimed[0]} is claimed: needs its sign-off",
    )
    touched = (review.get("sustainability") or {}).get("touched")
    check(
        "E15",
        not touched and gate_green,
        "no sustainability data, gate green" if not touched else "touches sustainability data",
    )
    ai_errors = [f for f in model.get("findings") or [] if f.get("severity") == "error"]
    blocked = NEW in kinds and ai_errors
    check(
        "E22",
        not blocked,
        "no 🔴 AI finding on new data"
        if not blocked
        else f"{len(ai_errors)} 🔴 AI finding(s), e.g. `{ai_errors[0].get('path', '')}`",
    )
    return items
