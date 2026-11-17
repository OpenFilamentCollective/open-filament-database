"""Tests for brand claims / representative sign-off (ofd/brand_claims.py)."""

import json
from pathlib import Path

from ofd.brand_claims import (
    CLAIMS_FILE,
    brands_touched,
    evaluate,
    load_claims,
    pending_brands,
    validate_claims,
)

HEAD = "a" * 40
OLD = "b" * 40
CLAIMS = {"acme": ["AcmeRep", "AcmeRep2"], "other": ["OtherRep"]}


def review(login, state, commit=HEAD):
    return {"user": {"login": login}, "state": state, "commit_id": commit}


def test_brands_touched_only_counts_brand_folders():
    paths = [
        "data/acme/PLA/basic/filament.json",
        "data/other/brand.json",
        "stores/acme/store.json",
        "schemas/brand_schema.json",
        "data/README.md",
    ]
    assert brands_touched(paths) == {"acme", "other"}


def test_unclaimed_brands_need_nothing():
    assert evaluate(["data/nobody/brand.json"], CLAIMS, "someone", [], HEAD) == {}


def test_claimed_brand_pending_without_review():
    state = evaluate(["data/acme/brand.json"], CLAIMS, "someone", [], HEAD)
    assert pending_brands(state) == ["acme"]


def test_approval_on_head_signs_off_case_insensitively():
    state = evaluate(
        ["data/acme/brand.json"], CLAIMS, "someone", [review("acmerep", "APPROVED")], HEAD
    )
    assert state["acme"]["signed_off_by"] == "AcmeRep"
    assert pending_brands(state) == []


def test_approval_on_older_commit_is_stale():
    state = evaluate(
        ["data/acme/brand.json"], CLAIMS, "someone", [review("AcmeRep", "APPROVED", OLD)], HEAD
    )
    assert pending_brands(state) == ["acme"]


def test_approval_by_non_representative_does_not_count():
    state = evaluate(
        ["data/acme/brand.json"], CLAIMS, "someone", [review("Maintainer", "APPROVED")], HEAD
    )
    assert pending_brands(state) == ["acme"]


def test_representative_authoring_the_pr_signs_off():
    state = evaluate(["data/acme/brand.json"], CLAIMS, "AcmeRep2", [], HEAD)
    assert state["acme"]["signed_off_by"] == "AcmeRep2"


def test_comment_does_not_replace_approval_but_dismissal_does():
    reviews = [review("AcmeRep", "APPROVED"), review("AcmeRep", "COMMENTED")]
    assert pending_brands(evaluate(["data/acme/x"], CLAIMS, "s", reviews, HEAD)) == []
    reviews.append(review("AcmeRep", "DISMISSED"))
    assert pending_brands(evaluate(["data/acme/x"], CLAIMS, "s", reviews, HEAD)) == ["acme"]


def test_changes_requested_by_one_rep_blocks_another_reps_approval():
    reviews = [review("AcmeRep", "APPROVED"), review("AcmeRep2", "CHANGES_REQUESTED")]
    state = evaluate(["data/acme/x"], CLAIMS, "s", reviews, HEAD)
    assert state["acme"]["changes_requested_by"] == ["AcmeRep2"]
    assert pending_brands(state) == ["acme"]


def test_every_touched_claimed_brand_needs_its_own_signoff():
    paths = ["data/acme/x", "data/other/y"]
    state = evaluate(paths, CLAIMS, "s", [review("AcmeRep", "APPROVED")], HEAD)
    assert pending_brands(state) == ["other"]


def test_validate_claims_flags_unknown_brand_and_bad_login(tmp_path):
    (tmp_path / "data" / "acme").mkdir(parents=True)
    (tmp_path / "data" / "acme" / "brand.json").write_text("{}")
    claims = tmp_path / "claims.json"
    claims.write_text(
        json.dumps(
            {
                "claims": {
                    "acme": {"representatives": ["good-login", "-bad"]},
                    "ghost": {"representatives": ["x"]},
                    "empty": {"representatives": []},
                }
            }
        )
    )
    errors = validate_claims(claims, tmp_path / "data")
    assert any("'-bad'" in e for e in errors)
    assert any(e.startswith("ghost: no such brand") for e in errors)
    assert any(e.startswith("empty:") and "non-empty" in e for e in errors)
    assert not any("good-login" in e for e in errors)


def test_repository_registry_is_valid():
    root = Path(__file__).parent.parent
    assert validate_claims(root / CLAIMS_FILE, root / "data") == []


def test_comment_says_merge_is_blocked_until_signed_off():
    from ofd.commands.claims import COMMENT_MARKER, _render_comment

    pending = evaluate(["data/acme/x"], CLAIMS, "s", [], HEAD)
    blocked = _render_comment(pending, HEAD, "blocked", [])
    assert blocked.startswith(COMMENT_MARKER)
    assert "Merging is blocked" in blocked and "brand-signoff-waived" in blocked
    assert "@AcmeRep" in blocked

    done = evaluate(["data/acme/x"], CLAIMS, "s", [review("AcmeRep", "APPROVED")], HEAD)
    assert "sign-off complete" in _render_comment(done, HEAD, "signed_off", [])
    assert "waived by a maintainer" in _render_comment(pending, HEAD, "waived", [])


def test_malformed_registry_is_reported_not_crashed_on(tmp_path):
    import pytest

    f = tmp_path / "claims.json"
    f.write_text(json.dumps([]))
    assert validate_claims(f, tmp_path) == [f"{f}: top-level 'claims' must be an object"]
    with pytest.raises(ValueError, match="'claims' must be an object"):
        load_claims(f)

    f.write_text(json.dumps({"claims": {"acme": {}}}))
    with pytest.raises(ValueError, match="acme: 'representatives'"):
        load_claims(f)


def test_comment_for_cleared_and_too_large_prs():
    from ofd.commands.claims import _render_comment

    cleared = _render_comment({}, HEAD, "cleared", [])
    assert "not needed" in cleared and "Merging is blocked" not in cleared

    too_large = _render_comment({}, HEAD, "truncated", [])
    assert "too large to check" in too_large and "| Brand |" not in too_large
    assert "too large to check" in _render_comment({}, HEAD, "waived", [])
