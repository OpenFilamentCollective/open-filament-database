"""
Flip-flop detection: a PR setting a field back to a value someone already replaced.

Values in this database get "corrected" back and forth when two sources disagree:
Inland Silk PLA's max nozzle went 230 <-> 220 depending on whether the description or
the spec table was read (#670), and a stale branch put Geeetech's template temps back
after they had been fixed (#183). Neither side is visibly wrong in its own diff, so
this walks the field's history and shows the reviewer the whole argument.
"""

import json
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ofd.review.gitdata import ChangedFile, git
from ofd.review.jsonlines import escape, resolve

# Automation whose churn is not a human disagreement. The anonymous web-editor bot is
# deliberately *not* here: its commits are real contributors' edits.
BOT_AUTHORS = {"github-actions[bot]", "github-actions"}

# Fields that are bookkeeping, not data anyone argues about.
IGNORED_KEYS = {"uuid", "moved_from"}

HISTORY_LIMIT = 40
CHURN_WINDOW = timedelta(days=365)
CHURN_THRESHOLD = 3

_MISSING = object()


@dataclass
class Change:
    value: Any
    author: str
    sha: str
    date: str


@dataclass
class FlipFlop:
    path: str
    pointer: str
    kind: str  # "revert" or "churn"
    new_value: Any
    timeline: list[Change] = field(default_factory=list)

    def describe(self) -> str:
        steps = " → ".join(
            f"`{_fmt(c.value)}` ({c.author}, {c.sha[:7]})" for c in self.timeline[-5:]
        )
        if self.kind == "revert":
            return (
                f"`{self.pointer}` is going back to `{_fmt(self.new_value)}`, which was "
                f"already changed away from: {steps} → this PR. Ask which source is right "
                f"before merging, and record it in the PR."
            )
        return (
            f"`{self.pointer}` has changed {len(self.timeline) - 1} times in the last year: "
            f"{steps} → this PR. Sources disagree; get a definitive one."
        )

    def to_dict(self) -> dict:
        data = asdict(self)
        # asdict deep-copies values, so the sentinel must be checked on the originals.
        for copy, change in zip(data["timeline"], self.timeline, strict=True):
            copy["value"] = None if change.value is _MISSING else change.value
        if self.new_value is _MISSING:
            data["new_value"] = None
        data["message"] = self.describe()
        return data


def _fmt(value: Any) -> str:
    return "(absent)" if value is _MISSING else str(value)


def is_bot(author: str) -> bool:
    return author in BOT_AUTHORS


def leaves(doc: Any, prefix: str = "") -> dict[str, Any]:
    """Pointer -> value for every scalar, treating arrays of scalars as one value."""
    out: dict[str, Any] = {}
    if isinstance(doc, dict):
        for key, value in doc.items():
            if key not in IGNORED_KEYS:
                out.update(leaves(value, f"{prefix}/{escape(key)}"))
    elif isinstance(doc, list) and any(isinstance(v, (dict, list)) for v in doc):
        for index, value in enumerate(doc):
            out.update(leaves(value, f"{prefix}/{index}"))
    else:
        out[prefix] = doc
    return out


def changed_leaves(before: Any, after: Any) -> dict[str, Any]:
    """Pointers whose value differs, mapped to the PR's new value."""
    old, new = leaves(before), leaves(after)
    return {
        p: new.get(p, _MISSING)
        for p in old.keys() | new.keys()
        if old.get(p, _MISSING) != new.get(p, _MISSING)
    }


def _history(repo: Path, base: str, path: str) -> list[tuple[str, str, str, Any]]:
    """``(sha, author, date, doc)`` for each commit touching ``path``, oldest first."""
    log = git(
        repo,
        "log",
        "--no-merges",
        f"-n{HISTORY_LIMIT}",
        "--format=%H%x1f%an%x1f%aI",
        base,
        "--",
        path,
    )
    commits = [line.split("\x1f") for line in log.splitlines() if line]
    commits.reverse()
    if not commits:
        return []
    proc = subprocess.run(
        ["git", "cat-file", "--batch"],
        cwd=repo,
        input="".join(f"{sha}:{path}\n" for sha, _, _ in commits).encode(),
        check=True,
        capture_output=True,
    )
    out, pos, history = proc.stdout, 0, []
    for sha, author, date in commits:
        end = out.index(b"\n", pos)
        header = out[pos:end].decode()
        pos = end + 1
        if header.endswith("missing"):
            history.append((sha, author, date, None))
            continue
        size = int(header.rsplit(" ", 1)[1])
        try:
            doc = json.loads(out[pos : pos + size])
        except ValueError:
            doc = None
        pos += size + 1
        history.append((sha, author, date, doc))
    return history


def _timeline(history, pointer: str) -> list[Change]:
    timeline: list[Change] = []
    for sha, author, date, doc in history:
        try:
            value = resolve(doc, pointer) if doc is not None else _MISSING
        except (KeyError, IndexError, TypeError, ValueError):
            value = _MISSING
        if not timeline or timeline[-1].value != value:
            timeline.append(Change(value, author, sha, date))
    return timeline


def detect(
    repo: Path, base: str, changes: list[ChangedFile], now: datetime | None = None
) -> list[FlipFlop]:
    now = now or datetime.now(timezone.utc)
    found: list[FlipFlop] = []
    for change in changes:
        if change.status != "M":
            continue
        pointers = changed_leaves(change.before, change.after)
        if not pointers:
            continue
        history = _history(repo, base, change.path)
        for pointer, new_value in sorted(pointers.items()):
            timeline = _timeline(history, pointer)
            if new_value is _MISSING:
                continue

            # A -> B (by a human) -> ... -> this PR sets A again.
            for i, entry in enumerate(timeline[:-1]):
                if entry.value == new_value and not is_bot(timeline[i + 1].author):
                    found.append(FlipFlop(change.path, pointer, "revert", new_value, timeline))
                    break
            else:
                recent = [
                    c
                    for c in timeline[1:]
                    if not is_bot(c.author) and now - datetime.fromisoformat(c.date) <= CHURN_WINDOW
                ]
                if len(recent) >= CHURN_THRESHOLD:
                    found.append(FlipFlop(change.path, pointer, "churn", new_value, timeline))
    return found
