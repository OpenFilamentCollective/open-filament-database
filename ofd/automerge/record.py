"""
The ``Auto-merge`` check run: the persisted eligibility record on a head commit.

Eligible is conclusion ``success`` ("Auto-merges after HH:MM UTC unless labelled
`hold`"); not eligible is ``neutral`` with the reasons, so neither GitHub nor the
webui merge page shows it as a failure. A small JSON record in the run's text carries
the time the PR became eligible at this commit; the proofs themselves are re-read
from the review artifact and re-fetched at merge time.

Only runs created by the auto-merge App and on the exact SHA are read. The record is
still not trusted for anything but the start of the hour: every condition, proofs
included, is re-checked from scratch before merging, so a forged record could at most
skip the delay, and only an App holding the key can write one.
"""

import json
import re
from datetime import datetime, timedelta, timezone

from ofd.automerge.eligibility import DELAY_MINUTES, HOLD_LABEL, SELF_CONTEXT, Eligibility
from ofd.review import github

_RECORD = re.compile(r"```json\n(\{.*?\})\n```", re.S)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def checklist(result: Eligibility) -> str:
    rows = ["| | Condition | Detail |", "|---|---|---|"]
    rows += [f"| {'✅' if i.ok else '❌'} | {i.id} | {i.detail} |" for i in result.items]
    return "\n".join(rows)


def latest(repo: str, sha: str, app_id: int) -> dict | None:
    """The newest ``Auto-merge`` run on ``sha`` written by the App, or None."""
    runs = github.api(
        f"repos/{repo}/commits/{sha}/check-runs?check_name={SELF_CONTEXT}&per_page=100"
    )
    own = [
        r
        for r in (runs or {}).get("check_runs", [])
        if (r.get("app") or {}).get("id") == app_id and r.get("head_sha") == sha
    ]
    return max(own, key=lambda r: r["id"]) if own else None


def parse(run: dict | None) -> dict | None:
    if not run:
        return None
    match = _RECORD.search((run.get("output") or {}).get("text") or "")
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except ValueError:
        return None


def eligible_since(run: dict | None, sha: str) -> datetime | None:
    """When the current unbroken eligible streak at ``sha`` began, or None."""
    record = parse(run)
    if not run or run.get("conclusion") != "success" or not record or record.get("sha") != sha:
        return None
    try:
        return datetime.fromisoformat(record["since"])
    except (KeyError, TypeError, ValueError):
        return None


def write(repo: str, result: Eligibility, previous: dict | None, mode: str) -> dict:
    """Post the record for ``result``; keeps the streak start when already eligible."""
    sha = result.head_sha
    since = eligible_since(previous, sha) if result.eligible else None
    if result.eligible and since is None:
        since = _now()
    shadow = " (shadow mode)" if mode == "shadow" else ""
    if result.eligible:
        when = (since + timedelta(minutes=DELAY_MINUTES)).strftime("%H:%M UTC")
        title = f"{'Would auto-merge' if shadow else 'Auto-merges'} after {when} unless labelled `{HOLD_LABEL}`{shadow}"
    else:
        title = f"Needs a maintainer: {len(result.failures)} reason(s){shadow}"
    record = {
        "v": 1,
        "sha": sha,
        "eligible": result.eligible,
        "since": since.isoformat() if since else None,
    }
    text = f"```json\n{json.dumps(record)}\n```"
    payload = {
        "name": SELF_CONTEXT,
        "head_sha": sha,
        "status": "completed",
        "conclusion": "success" if result.eligible else "neutral",
        "output": {"title": title[:255], "summary": checklist(result), "text": text},
    }
    return github.api(f"repos/{repo}/check-runs", "POST", payload)
