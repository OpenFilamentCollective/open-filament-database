"""
When auto-merge merges: once a night, at 22:00 Copenhagen time, before the 00:00 import.

A PR must have been eligible at its head for ``DELAY_MINUTES`` by then (eligible by
21:00), so there is always time to add `hold`. One that becomes eligible later waits
for the next night.

GitHub fires scheduled workflows hours late when it is busy, so auto_merge.yaml asks
for a sweep every ten minutes through the evening and the sweep itself checks the
clock: outside the window it does nothing. Inside it, every run merges the same set
(PRs that were due by 22:00), so later runs only retry what an earlier one could not
merge yet, e.g. because GitHub was still computing mergeability after a merge.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ofd.automerge.eligibility import DELAY_MINUTES

MERGE_TZ = ZoneInfo("Europe/Copenhagen")
MERGE_HOUR = 22
# A late cron still merges until 06:00. Past midnight that misses the night's import,
# but the PR lands in the next one, no later than waiting a whole day would.
WINDOW_HOURS = 8


def window_start(now: datetime) -> datetime | None:
    """The 22:00 merge window ``now`` falls in, or None outside every window."""
    local = now.astimezone(MERGE_TZ)
    start = local.replace(hour=MERGE_HOUR, minute=0, second=0, microsecond=0)
    if local < start:
        start -= timedelta(days=1)
    return start if local - start < timedelta(hours=WINDOW_HOURS) else None


def next_window(now: datetime) -> datetime:
    """The window ``now`` is in, else the next one: what a daytime dry run previews."""
    open_ = window_start(now)
    if open_ is not None:
        return open_
    local = now.astimezone(MERGE_TZ)
    start = local.replace(hour=MERGE_HOUR, minute=0, second=0, microsecond=0)
    return start if local < start else start + timedelta(days=1)


def merge_time(since: datetime) -> datetime:
    """The first 22:00 at least ``DELAY_MINUTES`` after a PR became eligible."""
    due = (since + timedelta(minutes=DELAY_MINUTES)).astimezone(MERGE_TZ)
    start = due.replace(hour=MERGE_HOUR, minute=0, second=0, microsecond=0)
    return start if due <= start else start + timedelta(days=1)


def describe(when: datetime) -> str:
    """``22:00 Copenhagen time on 28 Nov``, for the check title."""
    local = when.astimezone(MERGE_TZ)
    return f"{local:%H:%M} Copenhagen time on {local.day} {local:%b}"
