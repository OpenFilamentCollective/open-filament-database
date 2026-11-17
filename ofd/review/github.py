"""
The few GitHub calls the review makes, through the ``gh`` CLI.

``gh`` is preinstalled on Actions runners and reads ``GH_TOKEN``; locally it uses the
developer's own login, so ``ofd review run --pr N`` works from a laptop unchanged.
"""

import json
import subprocess
from typing import Any

DEFAULT_REPO = "OpenFilamentCollective/open-filament-database"


class GitHubError(RuntimeError):
    pass


def api(path: str, method: str = "GET", payload: Any = None) -> Any:
    cmd = ["gh", "api", "-X", method, path]
    if payload is not None:
        cmd += ["--input", "-"]
    proc = subprocess.run(
        cmd,
        input=json.dumps(payload) if payload is not None else None,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise GitHubError(f"{method} {path}: {proc.stderr.strip() or proc.stdout.strip()}")
    return json.loads(proc.stdout) if proc.stdout.strip() else None


def api_list(path: str) -> list:
    """Every item of a paginated list endpoint."""
    proc = subprocess.run(
        ["gh", "api", "--paginate", path, "--jq", ".[]"], capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise GitHubError(f"GET {path}: {proc.stderr.strip()}")
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def pull_request(repo: str, number: int) -> dict:
    return api(f"repos/{repo}/pulls/{number}")


def find_marker_comment(repo: str, number: int, marker: str) -> dict | None:
    for comment in api_list(f"repos/{repo}/issues/{number}/comments?per_page=100"):
        if marker in (comment.get("body") or ""):
            return comment
    return None


def upsert_comment(repo: str, number: int, existing: dict | None, body: str) -> None:
    if existing:
        api(f"repos/{repo}/issues/comments/{existing['id']}", "PATCH", {"body": body})
    else:
        api(f"repos/{repo}/issues/{number}/comments", "POST", {"body": body})


def create_review(repo: str, number: int, commit_id: str, body: str, comments: list[dict]) -> None:
    api(
        f"repos/{repo}/pulls/{number}/reviews",
        "POST",
        {"commit_id": commit_id, "event": "COMMENT", "body": body, "comments": comments},
    )


def set_status(
    repo: str, sha: str, context: str, state: str, description: str, url: str = ""
) -> None:
    payload = {"state": state, "context": context, "description": description[:140]}
    if url:
        payload["target_url"] = url
    api(f"repos/{repo}/statuses/{sha}", "POST", payload)


def remove_label(repo: str, number: int, label: str) -> None:
    try:
        api(f"repos/{repo}/issues/{number}/labels/{label}", "DELETE")
    except GitHubError:
        pass  # already gone


def last_labeler(repo: str, number: int, label: str) -> str | None:
    """Who most recently added ``label`` to the issue or PR."""
    actor = None
    for event in api_list(f"repos/{repo}/issues/{number}/events?per_page=100"):
        if event.get("event") == "labeled" and (event.get("label") or {}).get("name") == label:
            actor = (event.get("actor") or {}).get("login")
    return actor


def can_write(repo: str, login: str) -> bool:
    try:
        permission = api(f"repos/{repo}/collaborators/{login}/permission")
    except GitHubError:
        return False
    return (permission or {}).get("permission") in ("admin", "maintain", "write")
