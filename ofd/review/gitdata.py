"""
Read both sides of a pull request straight from git objects.

The head of a fork PR is untrusted, so it is never checked out for anything but the
model's read-only file tools: every JSON document here comes from ``git cat-file``.
"""

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

# The entity files the review understands, by file name.
ENTITY_FILES = {"brand.json", "material.json", "filament.json", "variant.json", "sizes.json"}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True, text=True
    ).stdout


class TreeReader:
    """Read files of one commit, batching blob reads through one ``cat-file`` process."""

    def __init__(self, repo: Path, sha: str):
        self.repo = repo
        self.sha = sha
        self._text: dict[str, str | None] = {}
        self._ls: dict[str, list[str]] = {}
        self._all: list[str] | None = None

    def all_paths(self) -> list[str]:
        if self._all is None:
            self._all = git(self.repo, "ls-tree", "-r", "--name-only", self.sha, "--").splitlines()
        return self._all

    def listdir(self, directory: str) -> list[str]:
        """Names of the immediate children of ``directory`` (files and folders)."""
        directory = directory.rstrip("/")
        if directory not in self._ls:
            out = git(self.repo, "ls-tree", "--name-only", f"{self.sha}:{directory}")
            self._ls[directory] = out.splitlines()
        return self._ls[directory]

    def exists(self, path: str) -> bool:
        parent = str(PurePosixPath(path).parent)
        try:
            return PurePosixPath(path).name in self.listdir(parent)
        except subprocess.CalledProcessError:
            return False

    def prefetch(self, paths: list[str]) -> None:
        """Load many blobs in one ``git cat-file --batch`` round trip."""
        missing = [p for p in paths if p not in self._text]
        if not missing:
            return
        proc = subprocess.run(
            ["git", "cat-file", "--batch"],
            cwd=self.repo,
            input="".join(f"{self.sha}:{p}\n" for p in missing).encode(),
            check=True,
            capture_output=True,
        )
        out = proc.stdout
        pos = 0
        for path in missing:
            end = out.index(b"\n", pos)
            header = out[pos:end].decode()
            pos = end + 1
            if header.endswith("missing"):
                self._text[path] = None
                continue
            size = int(header.rsplit(" ", 1)[1])
            self._text[path] = out[pos : pos + size].decode("utf-8", errors="replace")
            pos += size + 1

    def text(self, path: str) -> str | None:
        self.prefetch([path])
        return self._text[path]

    def json(self, path: str) -> Any | None:
        text = self.text(path)
        if text is None:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None


@dataclass
class ChangedFile:
    """One JSON file the pull request adds, modifies or deletes."""

    status: str  # "A", "M" or "D"
    path: str
    before: Any = None
    after: Any = None
    head_text: str | None = None
    # Line numbers (1-based, head side) GitHub accepts inline comments on.
    commentable: set[int] = field(default_factory=set)

    @property
    def kind(self) -> str:
        """``filament``, ``variant``, ``sizes``... from the file name."""
        return PurePosixPath(self.path).stem

    @property
    def directory(self) -> str:
        return str(PurePosixPath(self.path).parent)


def raw_diff(repo: Path, base: str, head: str) -> list[tuple[str, str, str, str]]:
    """(status, old mode, new mode, path) for every file ``base..head`` touches."""
    rows = []
    for line in git(repo, "diff", "--raw", "--no-renames", base, head).splitlines():
        meta, _, path = line.partition("\t")
        fields = meta.lstrip(":").split()
        if len(fields) >= 5:
            rows.append((fields[4][0], fields[0], fields[1], path))
    return rows


def _commentable_lines(repo: Path, base: str, head: str, path: str) -> set[int]:
    """Head-side lines inside the diff hunks GitHub shows (3 lines of context)."""
    lines: set[int] = set()
    for line in git(repo, "diff", "-U3", base, head, "--", path).splitlines():
        if line.startswith("@@"):
            # @@ -a,b +c,d @@
            right = line.split("+", 1)[1].split(" ", 1)[0]
            start, _, count = right.partition(",")
            n = int(count) if count else 1
            lines.update(range(int(start), int(start) + n))
    return lines


def changed_files(repo: Path, base: str, head: str) -> tuple[list[ChangedFile], list[str]]:
    """The PR's changed entity JSON files, plus every other changed path.

    ``base`` should be the merge base, so only the PR's own changes are compared.
    Renames are reported as a delete plus an add, which is how an id change looks.
    """
    out = git(repo, "diff", "--name-status", "--no-renames", base, head, "--", "data", "stores")
    base_tree, head_tree = TreeReader(repo, base), TreeReader(repo, head)
    rows = [line.split("\t", 1) for line in out.splitlines() if "\t" in line]

    entity_rows = [
        (s[0], p) for s, p in rows if PurePosixPath(p).name in ENTITY_FILES | {"store.json"}
    ]
    others = [p for s, p in rows if PurePosixPath(p).name not in ENTITY_FILES | {"store.json"}]
    base_tree.prefetch([p for s, p in entity_rows if s != "A"])
    head_tree.prefetch([p for s, p in entity_rows if s != "D"])

    changes: list[ChangedFile] = []
    for status, path in entity_rows:
        change = ChangedFile(status=status, path=path)
        if status != "A":
            change.before = base_tree.json(path)
        if status != "D":
            change.head_text = head_tree.text(path)
            change.after = head_tree.json(path)
            change.commentable = _commentable_lines(repo, base, head, path)
        changes.append(change)
    return changes, others
