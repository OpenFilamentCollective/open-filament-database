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

from ofd.automerge import merge, record
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
    assert "11:00 UTC" in posted[-1]["output"]["title"]

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


def setup_merge(monkeypatch, gh, eligible=True, mode="on"):
    monkeypatch.setattr(merge, "github", gh)
    monkeypatch.setattr(record, "latest", lambda *a: run(since="2026-10-28T10:00:00+00:00"))
    monkeypatch.setattr(record, "write", lambda *a, **k: gh.writes.append(("record", "")))
    snapshot = type("S", (), {"leaves": []})()
    monkeypatch.setattr(merge, "collect", lambda *a, **k: (snapshot, {}))
    monkeypatch.setattr(merge, "evaluate", lambda *a, **k: result(eligible))
    return {"mode": mode, "app_id": APP}


PR = {"number": 7, "head": {"sha": SHA}}


def test_merges_with_the_sha_pinned_then_says_lgtm(monkeypatch):
    gh = FakeGitHub()
    cfg = setup_merge(monkeypatch, gh)
    monkeypatch.setattr(merge, "context_for", lambda *a: None)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False) == "merged"
    assert gh.writes[0] == ("PUT", "repos/o/r/pulls/7/merge")
    assert gh.writes[1] == ("POST", "repos/o/r/issues/7/comments")


def test_a_push_or_hold_at_the_last_moment_wins(monkeypatch):
    for gh in (FakeGitHub(head="e" * 40), FakeGitHub(labels=["hold"])):
        cfg = setup_merge(monkeypatch, gh)
        assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False) == "changed at the last moment"
        assert gh.writes == []


def test_shadow_mode_and_dry_runs_never_merge(monkeypatch):
    gh = FakeGitHub()
    cfg = setup_merge(monkeypatch, gh, mode="shadow")
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False) == "would merge"
    cfg = setup_merge(monkeypatch, gh)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=True) == "would merge"
    assert gh.writes == []


def test_no_longer_eligible_records_why_and_does_not_merge(monkeypatch):
    gh = FakeGitHub()
    cfg = setup_merge(monkeypatch, gh, eligible=False)
    assert merge._merge_one("o/r", ROOT, PR, cfg, dry_run=False).startswith("no longer eligible")
    assert gh.writes == [("record", "")]


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
    doc["max_print_temperature"] = 235
    fil.write_text(json.dumps(doc, indent=2) + "\n")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "edit")
    assert merge.merged_tree_errors(tmp_path, "main~1", "HEAD") == []

    shutil.rmtree(tmp_path / "data/3dfox/PLA/pla_refill/blue")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "drop")
    errors = merge.merged_tree_errors(tmp_path, "main~2", "HEAD")
    assert any(e.startswith("`ofd uuid continuity`") for e in errors), errors
