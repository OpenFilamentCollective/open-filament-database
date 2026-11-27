"""Tests for the nightly auto-merge window (ofd/automerge/schedule.py)."""

from datetime import datetime, timezone

from ofd.automerge.schedule import MERGE_TZ, describe, merge_time, next_window, window_start


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


def test_the_window_opens_at_22_copenhagen_in_winter_and_summer():
    # Winter (CET, UTC+1): 22:00 local is 21:00 UTC.
    assert window_start(utc(2026, 11, 27, 20, 59)) is None
    assert window_start(utc(2026, 11, 27, 21, 0)) == datetime(2026, 11, 27, 22, tzinfo=MERGE_TZ)
    # Summer (CEST, UTC+2): 22:00 local is 20:00 UTC.
    assert window_start(utc(2026, 7, 1, 19, 59)) is None
    assert window_start(utc(2026, 7, 1, 20, 0)) == datetime(2026, 7, 1, 22, tzinfo=MERGE_TZ)


def test_a_late_cron_after_midnight_still_belongs_to_the_previous_evening():
    assert window_start(utc(2026, 11, 28, 2, 30)) == datetime(2026, 11, 27, 22, tzinfo=MERGE_TZ)
    assert window_start(utc(2026, 11, 28, 5, 0)) is None  # 06:00 local: closed


def test_a_pr_merges_at_the_first_22_an_hour_after_it_became_eligible():
    night = datetime(2026, 11, 27, 22, tzinfo=MERGE_TZ)
    assert merge_time(utc(2026, 11, 27, 8, 0)) == night
    assert merge_time(utc(2026, 11, 27, 20, 0)) == night  # 21:00 local: just in time
    assert merge_time(utc(2026, 11, 27, 20, 1)) == night.replace(day=28)
    assert describe(night) == "22:00 Copenhagen time on 27 Nov"


def test_a_daytime_dry_run_previews_tonights_window():
    tonight = datetime(2026, 11, 27, 22, tzinfo=MERGE_TZ)
    assert next_window(utc(2026, 11, 27, 13, 0)) == tonight
    assert next_window(utc(2026, 11, 27, 23, 0)) == tonight  # already open
    assert next_window(utc(2026, 11, 28, 6, 0)) == tonight.replace(day=28)  # 07:00 local
