"""Tests for skipping the model when a push only applies the review's own suggestions
(ofd/review/applied.py, `ofd review run --carry-from`).

The fixture is #819's 9644d5c, "Apply batched suggestions from code review".
"""

import copy

import pytest

from ofd.automerge import merge
from ofd.review import applied, github
from ofd.review.applied import why_not
from ofd.review.render import summary

ABS = "data/aurapol/ABS/abs/filament.json"
KRATOS = "data/formfutura/PC/kratos_pc/filament.json"
REVIEWED, HEAD = "8b920db" + "0" * 33, "9644d5c" + "0" * 33

COMMIT = {
    "sha": HEAD,
    "parents": [{"sha": REVIEWED}],
    "commit": {
        "committer": {"name": "GitHub", "email": "noreply@github.com"},
        "message": "Apply batched suggestions from code review\n\nCo-authored-by: "
        "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
    },
}


def patch(value: str) -> str:
    return (
        "@@ -11,5 +11,6 @@\n"
        '   "dry_time": 4,\n'
        f'+  "enclosure": "{value}",\n'
        '   "data_sheet_url": "https://example.com/abs.pdf"\n'
        " }"
    )


COMPARE = {
    "status": "ahead",
    "merge_base_commit": {"sha": REVIEWED},
    "commits": [COMMIT],
    "files": [
        {"filename": ABS, "status": "modified", "patch": patch("recommended")},
        {"filename": KRATOS, "status": "modified", "patch": patch("recommended")},
    ],
}


def suggestion(path: str, value: str, login: str = "github-actions[bot]") -> dict:
    return {
        "user": {"login": login},
        "path": path,
        "body": "**Suggested data**, from the linked sources. Commit it if it checks out:\n\n"
        f'- `/enclosure` = `"{value}"` (high, [source](https://example.com))\n\n'
        f'```suggestion\n  "dry_time": 4,\n  "enclosure": "{value}",\n```',
    }


COMMENTS = [
    {"user": {"login": "github-actions[bot]"}, "path": ABS, "body": "🟡 A finding."},
    suggestion(ABS, "recommended"),
    suggestion(KRATOS, "recommended"),
]


def test_applying_the_bots_suggestions_is_recognised():
    assert why_not(COMPARE, COMMENTS) is None


def broken(change):
    compare, comments = copy.deepcopy(COMPARE), copy.deepcopy(COMMENTS)
    change(compare, comments)
    return why_not(compare, comments)


@pytest.mark.parametrize(
    "change",
    [
        # A hand edit on top of the suggestion.
        lambda c, _: c["files"][0].update(patch=patch("required")),
        # Committed locally, or by anyone else.
        lambda c, _: c["commits"][0]["commit"]["committer"].update(email="me@example.com"),
        # A web edit that isn't a suggestion.
        lambda c, _: c["commits"][0]["commit"].update(message="Update filament.json"),
        # Someone else's suggestion (Copilot, a maintainer).
        lambda _, m: m.__setitem__(2, suggestion(KRATOS, "recommended", login="maintainer")),
        # Rebased or force-pushed.
        lambda c, _: c.update(status="diverged"),
        # A new file.
        lambda c, _: c["files"][1].update(status="added"),
        # A merge from main.
        lambda c, _: c["commits"][0].update(parents=[{"sha": "a"}, {"sha": "b"}]),
        # GitHub truncated the diff.
        lambda c, _: c["files"][0].pop("patch"),
    ],
    ids=[
        "hand edit",
        "local commit",
        "plain web edit",
        "not the bot",
        "force-push",
        "new file",
        "merge",
        "no patch",
    ],
)
def test_anything_else_gets_a_full_review(change):
    assert broken(change) is not None


class FakeGitHub:
    def __init__(self, compare=COMPARE, comments=COMMENTS, marker=REVIEWED):
        self.compare, self.comments, self.marker = compare, comments, marker

    def api(self, path, *a, **k):
        assert path.startswith("repos/o/r/compare/")
        return self.compare

    def api_list(self, path):
        return self.comments

    def find_marker_comment(self, *a):
        return {"body": f"<!-- ofd-ai-review:sha={self.marker} -->"}


def review_of(sha, **extra):
    return {
        "head_sha": sha,
        "model": {"model": "claude-haiku-5-5", "cost_usd": 0.4, "summary": "Fine."},
        "sustainability": {"touched": False},
        **extra,
    }


def install(monkeypatch, fake, previous):
    for name in ("api", "api_list", "find_marker_comment"):
        monkeypatch.setattr(github, name, getattr(fake, name))
    monkeypatch.setattr(merge, "download_review", lambda repo, n, sha: previous)


def test_check_carries_the_last_review_forward(monkeypatch):
    install(monkeypatch, FakeGitHub(), review_of(REVIEWED))
    sha, reason = applied.check("o/r", 819, HEAD)
    assert sha == REVIEWED, reason


@pytest.mark.parametrize(
    "previous",
    [
        None,
        review_of(REVIEWED, model={"error": "timed out"}),
        review_of(REVIEWED, sustainability={"touched": True}),
    ],
    ids=["no artifact", "model failed", "sustainability"],
)
def test_check_falls_back_to_a_full_review(monkeypatch, previous):
    install(monkeypatch, FakeGitHub(), previous)
    assert applied.check("o/r", 819, HEAD)[0] is None


def test_github_errors_mean_a_full_review(monkeypatch):
    install(monkeypatch, FakeGitHub(), review_of(REVIEWED))

    def fail(*a, **k):
        raise github.GitHubError("rate limited")

    monkeypatch.setattr(github, "api", fail)
    assert applied.check("o/r", 819, HEAD)[0] is None


def test_a_carried_review_says_so_and_keeps_its_commit():
    result = {
        "pr": 819,
        "repo": "o/r",
        "head_sha": HEAD,
        "findings": [],
        "flipflops": [],
        "sustainability": {"touched": False},
        "claimed_brands": {},
        "model": {**review_of(REVIEWED)["model"], "cost_usd": 0, "carried_from": REVIEWED},
    }
    text = summary(result)
    assert f"**Automated review** of `{HEAD[:7]}`" in text
    assert f"<!-- ofd-ai-review:sha={REVIEWED} -->" in text
    assert f"AI review of `{REVIEWED[:7]}`, carried over" in text
    assert "Outdated" not in text


def test_carry_reuses_the_model_pass_without_spend(monkeypatch):
    from ofd.review import run

    previous = review_of(REVIEWED, suggestion_count=2, sources=[{"url": "u", "ok": True}])
    previous["comments"] = [{"path": ABS, "line": 3, "body": "posted already"}]
    monkeypatch.setattr(merge, "download_review", lambda repo, n, sha: previous)
    result = {"pr": 819, "repo": "o/r", "head_sha": HEAD, "comments": [], "spent_usd": 0.4}
    run._carry(result, REVIEWED, [], [], None, None, None)
    assert result["model"]["carried_from"] == REVIEWED
    assert result["model"]["cost_usd"] == 0 and result["spent_usd"] == 0.4
    assert result["suggestion_count"] == 2 and result["sources"] == previous["sources"]
    assert result["comments"] == []  # nothing is posted inline twice
