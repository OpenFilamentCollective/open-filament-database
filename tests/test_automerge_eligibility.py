"""Tests for the auto-merge checklist (ofd/automerge/eligibility.py).

One fully eligible snapshot, then each condition broken on its own: every one must
stop the merge, and name itself as the reason.
"""

import copy
from datetime import datetime, timedelta, timezone

import pytest

from ofd.automerge.eligibility import REQUIRED_CONTEXTS, Snapshot, evaluate
from ofd.automerge.proof import Leaf

SHA = "a" * 40
FIL = "data/acme/PLA/basic/filament.json"
NEW_VARIANT = "data/acme/PLA/basic/red/variant.json"
NEW_SIZES = "data/acme/PLA/basic/red/sizes.json"
NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)


def green() -> Snapshot:
    leaf = Leaf(FIL, "/max_print_temperature", "modify", 230, 220, "filament", "M")
    return Snapshot(
        mode="on",
        has_token=True,
        pr={
            "state": "open",
            "draft": False,
            "mergeable": True,
            "labels": [],
            "user": {"login": "contributor"},
            "head": {"sha": SHA},
            "base": {"ref": "main", "repo": {"default_branch": "main"}},
        },
        raw_diff=[("M", "100644", "100644", FIL)],
        review={
            "head_sha": SHA,
            "findings": [],
            "flipflops": [],
            "model": {"model": "claude-haiku-5-5", "cost_usd": 0.02},
            "sustainability": {"touched": False},
        },
        leaves=[leaf],
        proofs={leaf.key: {"ok": True, "reason": "", "proof": {}}},
        finding_verdicts=[],
        claims={"proteor_print": ["RileyBeenders"]},
        checks=dict.fromkeys(REQUIRED_CONTEXTS, "success"),
        ruleset_contexts=["Brand sign-off"],
        reviews=[],
        merged_tree_errors=[],
        eligible_since=NOW - timedelta(minutes=61),
        now=NOW,
    )


def test_the_green_snapshot_is_eligible():
    result = evaluate(green(), at_merge=True)
    assert result.eligible, [(i.id, i.detail) for i in result.failures]


def _set(path, value):
    def apply(s):
        target = s
        *parents, last = path
        for p in parents:
            target = target[p] if isinstance(target, dict) else getattr(target, p)
        if isinstance(target, dict):
            target[last] = value
        else:
            setattr(target, last, value)

    return apply


BREAKS = {
    "E1": _set(["mode"], "off"),
    "E2": _set(["pr", "draft"], True),
    "E3": _set(["review", "head_sha"], "b" * 40),
    "E4": _set(["pr", "labels"], [{"name": "hold"}]),
    "E5": _set(["pr", "labels"], [{"name": "brand-signoff-waived"}]),
    "E6": _set(
        ["raw_diff"],
        [("M", "100644", "100644", FIL), ("M", "100644", "100644", "data/acme/logo.png")],
    ),
    "E7": _set(["raw_diff"], [("D", "100644", "000000", FIL)]),
    "E8": _set(
        ["raw_diff"],
        [
            ("M", "100644", "100644", FIL),
            ("M", "100644", "100644", "data/other/PLA/x/filament.json"),
        ],
    ),
    "E9": lambda s: s.leaves.append(Leaf(FIL, "/name", "modify", "A", "B", "filament", "M")),
    "E10": _set(["proofs"], {f"{FIL}#/max_print_temperature": {"ok": False, "reason": "no proof"}}),
    "E11": _set(["finding_verdicts"], [{"verdict": "verified"}]),
    "E12": _set(["review", "flipflops"], [{"path": FIL}]),
    "E13": _set(["review", "model"], {"error": "timed out"}),
    "E14": _set(
        ["raw_diff"], [("M", "100644", "100644", "data/proteor_print/PLA/x/filament.json")]
    ),
    "E15": _set(["review", "sustainability"], {"touched": True}),
    "E16": _set(["checks", "Validate data - data-quality"], "failure"),
    "E17": _set(["reviews"], [{"user": {"login": "maint"}, "state": "CHANGES_REQUESTED"}]),
    "E18": _set(["pr", "mergeable"], None),
    "E19": _set(["merged_tree_errors"], ["`ofd validate`: 1 error"]),
    "E20": _set(["eligible_since"], NOW - timedelta(minutes=30)),
    "E21": _set(["blocked_users"], {"Contributor"}),
    "E22": lambda s: (
        s.leaves.append(Leaf(NEW_VARIANT, "", "add", None, {"name": "Red"}, "variant", "A")),
        s.raw_diff.append(("A", "000000", "100644", NEW_VARIANT)),
        s.review["model"].update(findings=[{"path": NEW_VARIANT, "severity": "error"}]),
    ),
}


@pytest.mark.parametrize("item", sorted(BREAKS, key=lambda k: int(k[1:])))
def test_each_condition_alone_blocks(item):
    snapshot = copy.deepcopy(green())
    BREAKS[item](snapshot)
    result = evaluate(snapshot, at_merge=True)
    assert not result.eligible
    assert item in [i.id for i in result.failures]


def test_a_missing_required_check_blocks():
    snapshot = green()
    del snapshot.checks["Brand sign-off"]
    assert "E16" in [i.id for i in evaluate(snapshot).failures]


def test_a_re_review_started_by_hand_counts():
    """A dispatched or `/review` run puts its "AI review" check on main, not the head;
    the review artifact for the head (E3, E13) is what counts."""
    snapshot = green()
    snapshot.checks.pop("AI review", None)
    assert evaluate(snapshot).eligible
    snapshot.checks["AI review"] = "failure"
    assert "E16" in [i.id for i in evaluate(snapshot).failures]


def test_a_pending_unrelated_check_blocks_but_our_own_does_not():
    snapshot = green()
    snapshot.checks["Auto-merge"] = "pending"
    assert evaluate(snapshot).eligible
    snapshot.checks["webui tests"] = "pending"
    assert not evaluate(snapshot).eligible


def test_merge_time_conditions_are_only_checked_at_merge():
    snapshot = green()
    snapshot.eligible_since = None
    assert evaluate(snapshot).eligible
    assert not evaluate(snapshot, at_merge=True).eligible


# --- additions: a lower bar ----------------------------------------------------------


def additions(*files: tuple[str, str]) -> Snapshot:
    """A green snapshot whose PR only adds ``(path, kind)`` files."""
    snapshot = green()
    snapshot.raw_diff = [("A", "000000", "100644", path) for path, _ in files]
    snapshot.leaves = [
        Leaf(path, "", "add", None, {}, kind, "A") for path, kind in files if path.endswith(".json")
    ]
    snapshot.proofs = {}
    return snapshot


@pytest.mark.parametrize(
    "files",
    [
        [(NEW_VARIANT, "variant"), (NEW_SIZES, "sizes")],
        [("stores/best_buy/store.json", "store"), ("stores/best_buy/logo.png", "")],
        [
            ("data/newbrand/brand.json", "brand"),
            ("data/newbrand/logo.png", ""),
            ("data/newbrand/PLA/material.json", "material"),
            ("data/newbrand/PLA/basic/filament.json", "filament"),
        ],
    ],
    ids=["new colour", "new store", "new brand"],
)
def test_an_add_only_pr_is_eligible(files):
    result = evaluate(additions(*files), at_merge=True)
    assert result.eligible, [(i.id, i.detail) for i in result.failures]


def test_an_appended_spool_row_is_eligible():
    snapshot = green()
    sizes = "data/acme/PLA/basic/black/sizes.json"
    snapshot.raw_diff = [("M", "100644", "100644", sizes)]
    snapshot.leaves = [Leaf(sizes, "/1", "add", None, {"filament_weight": 3000}, "sizes", "M")]
    snapshot.proofs = {}
    assert evaluate(snapshot, at_merge=True).eligible


def test_additions_with_a_proven_change_are_eligible_and_an_unproven_one_blocks():
    snapshot = green()
    snapshot.raw_diff.append(("A", "000000", "100644", NEW_VARIANT))
    snapshot.leaves.append(Leaf(NEW_VARIANT, "", "add", None, {}, "variant", "A"))
    assert evaluate(snapshot, at_merge=True).eligible
    snapshot.proofs = {}
    assert "E10" in [i.id for i in evaluate(snapshot, at_merge=True).failures]
    snapshot = additions((NEW_VARIANT, "variant"))
    snapshot.raw_diff.append(("M", "100644", "100644", FIL))
    snapshot.leaves.append(Leaf(FIL, "/name", "modify", "A", "B", "filament", "M"))
    assert "E9" in [i.id for i in evaluate(snapshot, at_merge=True).failures]


def test_a_deletion_or_rename_alongside_additions_blocks():
    snapshot = additions((NEW_VARIANT, "variant"))
    snapshot.raw_diff.append(("D", "100644", "000000", "data/acme/PLA/basic/blue/variant.json"))
    assert "E7" in [i.id for i in evaluate(snapshot).failures]


def test_only_ai_errors_block_new_data_and_never_a_pure_change():
    snapshot = additions((NEW_VARIANT, "variant"))
    snapshot.review["model"]["findings"] = [
        {"path": NEW_VARIANT, "severity": "warning"},
        {"path": NEW_VARIANT, "severity": "note"},
    ]
    assert evaluate(snapshot, at_merge=True).eligible
    snapshot = green()
    snapshot.review["model"]["findings"] = [{"path": FIL, "severity": "error"}]
    assert evaluate(snapshot, at_merge=True).eligible


def test_a_new_file_outside_data_and_stores_blocks():
    snapshot = additions((NEW_VARIANT, "variant"))
    snapshot.raw_diff.append(("A", "000000", "100644", "scripts/evil.py"))
    assert "E6" in [i.id for i in evaluate(snapshot).failures]
