"""Tests for the Auto-merge record and the merge sweep, with GitHub mocked.

The record only times the hour; everything else is re-checked when merging. These
cases cover the ways a merge must still not happen at the last moment.
"""

import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ofd.automerge import merge, record, schedule
from ofd.automerge.eligibility import Eligibility, Item

SHA = "c" * 40
APP = 4242
ROOT = Path(__file__).resolve().parents[1]


def result(eligible=True):
    return Eligibility(eligible, SHA, [Item("E1", True, "on"), Item("E4", eligible, "hold")])


def run(conclusion="success", since=None, app=APP, sha=SHA, rid=1):
    rec = {"v": 1, "sha": sha, "eligible": conclusion == "success", "since": since}
    return {
        "id": rid,
        "app": {"id": app},
        "head_sha": sha,
        "conclusion": conclusion,
        "output": {"text": f"```json\n{json.dumps(rec)}\n```"},
    }


# --- record ---------------------------------------------------------------------


def test_only_the_apps_own_runs_on_this_commit_count(monkeypatch):
    hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    runs = [
        run(since=hour_ago, app=1, rid=9),  # another app: forged
        run(since=hour_ago, sha="d" * 40, rid=8),  # another commit
        run(since=hour_ago, rid=3),
    ]
    monkeypatch.setattr(record.github, "api", lambda *a, **k: {"check_runs": runs})
    latest = record.latest("o/r", SHA, APP)
    assert latest["id"] == 3
    assert record.eligible_since(latest, SHA) == datetime.fromisoformat(hour_ago)
    assert record.eligible_since(run("neutral", hour_ago), SHA) is None


def test_writing_keeps_the_streak_and_a_break_restarts_it(monkeypatch):
    posted = []
    monkeypatch.setattr(
        record.github, "api", lambda path, method="GET", payload=None: posted.append(payload)
    )
    start = datetime(2026, 10, 28, 10, tzinfo=timezone.utc)
    record.write("o/r", result(True), run(since=start.isoformat()), "on")
    assert posted[-1]["conclusion"] == "success"
    assert (
        json.loads(re.search(r"\{.*\}", posted[-1]["output"]["text"]).group())["since"]
        == start.isoformat()
    )
    assert "22:00 Copenhagen time on 28 Oct" in posted[-1]["output"]["title"]

    record.write("o/r", result(False), run(since=start.isoformat()), "on")
    assert posted[-1]["conclusion"] == "neutral"
    record.write("o/r", result(True), run("neutral"), "shadow")
    new_since = json.loads(re.search(r"\{.*\}", posted[-1]["output"]["text"]).group())["since"]
    assert datetime.fromisoformat(new_since) > start
    assert "(shadow mode)" in posted[-1]["output"]["title"]


# --- merge ----------------------------------------------------------------------


class FakeGitHub:
    """Records every write; `head` and `labels` can change between calls."""

    def __init__(self, head=SHA, labels=()):
        self.head, self.labels, self.writes = head, list(labels), []

    def pull_request(self, repo, number):
        return {
            "number": number,
            "head": {"sha": self.head},
            "labels": [{"name": n} for n in self.labels],
        }

    def api(self, path, method="GET", payload=None):
        if method != "GET":
            self.writes.append((method, path))
        return {}


def setup_merge(
    monkeypatch, gh, eligible=True, mode="on", since="2026-10-28T10:00:00+00:00", outcome=None
):
    monkeypatch.setattr(merge, "github", gh)
    monkeypatch.setattr(record, "latest", lambda *a: run(since=since))
    monkeypatch.setattr(record, "write", lambda *a, **k: gh.writes.append(("record", "")))
    snapshot = type("S", (), {"leaves": [], "pr": {"mergeable": True}})()
    gh.collected = 0

    def collect(*a, **k):
        gh.collected += 1
        return snapshot, {}

    monkeypatch.setattr(merge, "collect", collect)
    monkeypatch.setattr(merge, "evaluate", lambda *a, **k: outcome or result(eligible))
    return {"mode": mode, "app_id": APP}, snapshot


PR = {"number": 7, "head": {"sha": SHA}}


def test_merges_with_the_sha_pinned_then_says_lgtm(monkeypatch):
    gh = FakeGitHub()
    cfg, _ = setup_merge(monkeypatch, gh)
    monkeypatch.setattr(merge, "context_for", lambda *a: None)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None) == "merged"
    assert gh.writes[0] == ("PUT", "repos/o/r/pulls/7/merge")
    assert gh.writes[1] == ("POST", "repos/o/r/issues/7/comments")


def test_a_push_or_hold_at_the_last_moment_wins(monkeypatch):
    for gh in (FakeGitHub(head="e" * 40), FakeGitHub(labels=["hold"])):
        cfg, _ = setup_merge(monkeypatch, gh)
        assert (
            merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None)
            == "changed at the last moment"
        )
        assert gh.writes == []


def test_shadow_mode_and_dry_runs_never_merge(monkeypatch):
    gh = FakeGitHub()
    cfg, _ = setup_merge(monkeypatch, gh, mode="shadow")
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None) == "would merge"
    cfg, _ = setup_merge(monkeypatch, gh)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=True, window=None) == "would merge"
    assert gh.writes == []


def test_no_longer_eligible_records_why_and_does_not_merge(monkeypatch):
    gh = FakeGitHub()
    cfg, _ = setup_merge(monkeypatch, gh, eligible=False)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None).startswith(
        "no longer eligible"
    )
    assert gh.writes == [("record", "")]


def test_a_sweep_before_the_hour_waits_and_keeps_the_clock(monkeypatch):
    """Evaluating early would fail E20 and record "not eligible", ending the streak
    for good: nothing re-evaluates an idle PR (#890)."""
    gh = FakeGitHub()
    since = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    cfg, _ = setup_merge(monkeypatch, gh, since=since)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None).startswith(
        "waiting until"
    )
    assert gh.writes == [] and gh.collected == 0


def test_tonights_window_merges_only_what_was_due_by_22(monkeypatch):
    """A PR must be eligible by 21:00 to merge at 22:00; later ones wait a night."""
    gh = FakeGitHub()
    window = datetime(2026, 11, 26, 22, tzinfo=schedule.MERGE_TZ)
    late = (window - timedelta(minutes=30)).isoformat()
    cfg, _ = setup_merge(monkeypatch, gh, since=late)
    out = merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=window)
    assert out == "waiting for 22:00 Copenhagen time on 27 Nov"
    assert gh.writes == [] and gh.collected == 0

    monkeypatch.setattr(merge, "context_for", lambda *a: None)
    early = (window - timedelta(minutes=60)).isoformat()
    cfg, _ = setup_merge(monkeypatch, gh, since=early)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=window) == "merged"


def test_a_sweep_outside_the_window_touches_nothing(monkeypatch):
    gh = FakeGitHub()
    monkeypatch.setattr(merge, "github", gh)
    monkeypatch.setattr(merge, "settings", lambda: {"mode": "on", "app_id": APP})
    monkeypatch.setattr(schedule, "window_start", lambda now: None)
    monkeypatch.setattr(gh, "api_list", lambda *a: [PR], raising=False)
    monkeypatch.setattr(merge, "_merge_one", lambda *a: pytest.fail("swept outside the window"))
    assert merge.sweep("o/r", ROOT) == {}


def test_mergeability_not_computed_yet_waits_and_keeps_the_clock(monkeypatch):
    """GitHub's lazily computed ``mergeable: null`` once ended the streak of PRs that
    were fine in every other way (#928, #927, #921, #899, #897, #895)."""
    gh = FakeGitHub()
    unknown = Eligibility(False, SHA, [Item("E1", True, "on"), Item("E18", False, "None")])
    cfg, snapshot = setup_merge(monkeypatch, gh, outcome=unknown)
    snapshot.pr = {"mergeable": None}
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None).startswith("waiting")
    assert gh.writes == []

    snapshot.pr = {"mergeable": False}  # a real conflict is recorded
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False, window=None).startswith(
        "no longer eligible"
    )
    assert gh.writes == [("record", "")]


def test_mergeable_is_re_read_until_github_has_computed_it(monkeypatch):
    answers = iter([None, None, True])
    calls = []

    class GH:
        @staticmethod
        def pull_request(repo, number):
            calls.append(number)
            return {"state": "open", "mergeable": next(answers)}

    monkeypatch.setattr(merge, "github", GH)
    monkeypatch.setattr(merge.time, "sleep", lambda s: None)
    assert merge.settled_pull_request("o/r", 7)["mergeable"] is True
    assert len(calls) == 3

    answers = iter([None] * 10)
    calls.clear()
    assert merge.settled_pull_request("o/r", 7)["mergeable"] is None
    assert len(calls) == merge.MERGEABLE_TRIES


def test_lgtm_text_matches_the_webui():
    ts = (ROOT / "webui/src/lib/config/reviewMessages.ts").read_text(encoding="utf-8")
    quoted = re.search(r'LGTM_MESSAGE\s*=\s*"((?:[^"\\]|\\.)*)"', ts).group(1)
    assert json.loads(f'"{quoted}"') == merge.LGTM_MESSAGE


# --- E19: the merged tree -------------------------------------------------------

ROOT = Path(__file__).parent.parent


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def test_merged_tree_is_validated_outside_a_checkout(tmp_path, monkeypatch):
    """The merged tree is extracted to a plain folder; continuity once failed there on
    every PR ("not a git repository"), so nothing could ever merge (#798)."""
    shutil.copytree(ROOT / "data" / "3dfox", tmp_path / "data" / "3dfox")
    shutil.copytree(ROOT / "stores", tmp_path / "stores")
    shutil.copytree(ROOT / "schemas", tmp_path / "schemas")  # validate reads them from cwd
    _git(tmp_path, "init", "-q", "-b", "main")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "add", ".")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "main")
    monkeypatch.setenv("PYTHONPATH", str(ROOT))

    fil = tmp_path / "data/3dfox/PLA/pla_refill/filament.json"
    doc = json.loads(fil.read_text())
    doc["max_print_temperature"] += 1  # a real edit whatever the data says
    fil.write_text(json.dumps(doc, indent=2) + "\n")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "edit")
    assert merge.merged_tree_errors(tmp_path, "main~1", "HEAD") == []

    shutil.rmtree(tmp_path / "data/3dfox/PLA/pla_refill/blue")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "drop")
    errors = merge.merged_tree_errors(tmp_path, "main~2", "HEAD")
    assert any(e.startswith("`ofd uuid continuity`") for e in errors), errors
