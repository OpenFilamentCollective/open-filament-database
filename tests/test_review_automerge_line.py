"""The review comment's "Auto-merge:" line runs the Auto-merge check's own checklist.

#835 got "nothing in the content holds it" while the check failed E8 (a one-brand limit, since
removed), because the comment only looked at a hand-picked subset of conditions.
"""

from dataclasses import asdict

import pytest

from ofd.automerge.proof import Leaf
from ofd.review import run
from ofd.review.render import summary

HEAD = "a" * 40
VARIANT = "data/acme/PLA/basic/red/variant.json"
SIZES = "data/smartprint/PETG/petg/copper/sizes.json"


class FakeGitHub:
    def __init__(self):
        self.comments = []

    def pull_request(self, repo, number):
        return {
            "state": "open",
            "draft": False,
            "base": {"ref": "main", "repo": {"default_branch": "main"}},
            "head": {"sha": HEAD},
            "labels": [],
            "user": {"login": "contributor"},
            "mergeable": None,
        }

    def api_list(self, path):
        return []

    def set_status(self, *args, **kwargs):
        pass

    def upsert_comment(self, repo, number, existing, body):
        self.comments.append(body)

    def create_review(self, *args):
        pass

    def find_marker_comment(self, *args):
        return None


def _result(raw_diff, leaves):
    return {
        "pr": 1,
        "repo": "o/r",
        "head_sha": HEAD,
        "has_data": True,
        "labels": [],
        "findings": [],
        "flipflops": [],
        "model": {"findings": [], "proofs": []},
        "comments": [],
        "claimed_brands": {},
        "proofs": {},
        "finding_verdicts": [],
        "raw_diff": raw_diff,
        "leaves": [asdict(leaf) for leaf in leaves],
        "sustainability": {
            "touched": False,
            "entries": [],
            "removed": [],
            "traits": [],
            "rule_paths": [],
            "log_changed": False,
        },
    }


def _new_files():
    """Two brands, two new files: the shape of #835."""
    return _result(
        [("A", "000000", "100644", VARIANT), ("A", "000000", "100644", SIZES)],
        [
            Leaf(VARIANT, "", "add", None, {"name": "Red"}, "variant", "A"),
            Leaf(SIZES, "", "add", None, [{"filament_weight": 1000}], "sizes", "A"),
        ],
    )


def _posted(monkeypatch, result, mode="on"):
    monkeypatch.setenv("OFD_AUTOMERGE", mode)
    monkeypatch.setenv("OFD_AUTOMERGE_APP_ID", "1")
    monkeypatch.setenv("GH_TOKEN", "t")
    fake = FakeGitHub()
    monkeypatch.setattr(run, "github", fake)
    run.post("o/r", result)
    (body,) = fake.comments
    (line,) = [ln for ln in body.splitlines() if ln.startswith("**Auto-merge:**")]
    return line


def test_clean_new_data_across_brands_can_merge(monkeypatch):
    line = _posted(monkeypatch, _new_files())
    assert "nothing holds it now" in line


def test_a_deletion_is_named_in_the_comment(monkeypatch):
    result = _new_files()
    result["raw_diff"].append(("D", "100644", "000000", "data/acme/PLA/basic/blue/variant.json"))
    line = _posted(monkeypatch, result)
    assert "held back: E7" in line
    assert "nothing holds it" not in line


@pytest.mark.parametrize(
    ("mode", "expected"),
    [("shadow", "shadow mode, so a maintainer merges it"), ("off", "E1 auto-merge is off")],
)
def test_the_mode_is_never_hidden(monkeypatch, mode, expected):
    assert expected in _posted(monkeypatch, _new_files(), mode=mode)


def test_no_status_no_line():
    result = _new_files()
    result["automerge"] = None
    assert "**Auto-merge:**" not in summary(result)
