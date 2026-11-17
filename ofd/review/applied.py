"""
Did the new commits only apply the bot's own suggestions?

Clicking **Commit suggestion** (or committing a batch) on the review's
```suggestion``` blocks pushes a commit, and every push used to buy a full model
pass that re-reviewed data the model had just researched itself (#819, 9644d5c).
When every commit since the last model pass is such a commit, CI skips the model
and carries the previous AI review forward (``ofd review run --carry-from``), so
the free checks, the gate status and auto-merge still see the new head.

All of these must hold, or the PR gets a normal review:

- the PR head is a fast-forward of the reviewed commit (no rebase, no force-push);
- each commit was made by GitHub's web UI (committer ``noreply@github.com``) with
  the reviewer bot as co-author, which is what applying a suggestion records;
- every changed file already existed, has a suggestion from the bot, and every
  line the commits add is a line of one of those suggestions;
- the review being carried forward exists, its model pass completed, and the PR
  touches no sustainability data (that always gets a fresh model pass for the gate).

Any API error answers "no": the cost of a wrong "no" is one model pass.
"""

import re

from ofd.review import github
from ofd.review.render import AI_SHA, MARKER

BOT_LOGIN = "github-actions[bot]"
BOT_COAUTHOR = re.compile(
    r"^Co-authored-by: github-actions\[bot\] <41898282\+github-actions\[bot\]@users\.noreply\.github\.com>$",
    re.MULTILINE | re.IGNORECASE,
)
WEB_FLOW_EMAIL = "noreply@github.com"
_SUGGESTION = re.compile(r"^```suggestion[^\n]*\n(.*?)^```", re.MULTILINE | re.DOTALL)


def reviewed_sha(repo: str, number: int) -> str | None:
    """The commit the last model pass reviewed, from the summary comment."""
    comment = github.find_marker_comment(repo, number, MARKER)
    match = AI_SHA.search((comment or {}).get("body", ""))
    return match.group(1) if match else None


def suggested_lines(comments: list[dict]) -> dict[str, set[str]]:
    """path -> every line the bot's suggestion blocks would write there."""
    lines: dict[str, set[str]] = {}
    for comment in comments:
        if (comment.get("user") or {}).get("login") != BOT_LOGIN:
            continue
        for block in _SUGGESTION.findall(comment.get("body") or ""):
            lines.setdefault(comment.get("path", ""), set()).update(
                line.rstrip() for line in block.splitlines()
            )
    return lines


def added_lines(patch: str) -> list[str]:
    return [
        line[1:].rstrip()
        for line in (patch or "").splitlines()
        if line.startswith("+") and not line.startswith("+++")
    ]


def why_not(compare: dict, comments: list[dict]) -> str | None:
    """None when the compared commits only apply the bot's suggestions, else why not."""
    if compare.get("status") != "ahead":
        return f"the head is not a fast-forward ({compare.get('status')})"
    commits = compare.get("commits") or []
    if not commits:
        return "no new commits"
    for commit in commits:
        info = commit.get("commit") or {}
        sha = commit.get("sha", "")[:7]
        if (info.get("committer") or {}).get("email") != WEB_FLOW_EMAIL:
            return f"{sha} was not made in GitHub's web UI"
        if not BOT_COAUTHOR.search(info.get("message") or ""):
            return f"{sha} does not apply a suggestion from {BOT_LOGIN}"
        if len(commit.get("parents") or []) != 1:
            return f"{sha} is a merge commit"
    suggested = suggested_lines(comments)
    files = compare.get("files") or []
    if not files:
        return "the commits change nothing"
    for file in files:
        path = file.get("filename", "")
        if file.get("status") != "modified":
            return f"{path} is {file.get('status')}"
        if path not in suggested:
            return f"{path} has no suggestion from {BOT_LOGIN}"
        if "patch" not in file:
            return f"{path}: GitHub sent no patch"
        extra = [line for line in added_lines(file["patch"]) if line not in suggested[path]]
        if extra:
            return f"{path} adds a line no suggestion has: {extra[0].strip()[:60]}"
    return None


def check(repo: str, number: int, head: str, since: str | None = None) -> tuple[str | None, str]:
    """``(sha to carry the review from, reason)``; the sha is None for a full review."""
    from ofd.automerge.merge import download_review

    try:
        since = since or reviewed_sha(repo, number)
        if not since:
            return None, "no earlier AI review on this PR"
        if head.startswith(since):
            return None, "the head is the reviewed commit"
        compare = github.api(f"repos/{repo}/compare/{since}...{head}")
        comments = github.api_list(f"repos/{repo}/pulls/{number}/comments?per_page=100")
        if reason := why_not(compare or {}, comments):
            return None, reason
        full = (compare.get("merge_base_commit") or {}).get("sha") or since
        previous = download_review(repo, number, full)
    except github.GitHubError as exc:
        return None, f"GitHub said no ({exc})"
    model = (previous or {}).get("model") or {}
    if not model or model.get("error"):
        return None, f"no completed AI review of {since[:7]} to carry forward"
    if (previous.get("sustainability") or {}).get("touched"):
        return None, "the PR touches sustainability data"
    return previous["head_sha"], f"only applies {BOT_LOGIN}'s suggestions to {since[:7]}"
