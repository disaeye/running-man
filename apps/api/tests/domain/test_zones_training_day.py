"""Zone distribution must bucket an activity on the athlete's training day.

`start_time` arrives as an aware instant. Reading `.date()` off it converts in
UTC, so an evening run in Asia/Shanghai is filed under the previous day. That
matters beyond cosmetics here: `weekly_breakdown` groups by the Monday of
`start_date`, so one wrong day moves the whole session into a different week
bucket on the intensity chart.

The activity date is also now an error rather than a guess when the timestamp
cannot be placed, because a silently wrong week is worse than a named failure.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from domain.insights.zones import (
    ActivityLike,
    Zone,
    activity_distribution,
    weekly_breakdown,
)

SHANGHAI = "Asia/Shanghai"
NEW_YORK = "America/New_York"

ZONES: list[Zone] = [
    {"zone": 1, "name": "Z1", "min_pct": 0.0, "max_pct": 0.6, "min_value": 0, "max_value": 119},
    {"zone": 2, "name": "Z2", "min_pct": 0.6, "max_pct": 0.7, "min_value": 120, "max_value": 139},
    {"zone": 3, "name": "Z3", "min_pct": 0.7, "max_pct": 0.8, "min_value": 140, "max_value": 159},
    {"zone": 4, "name": "Z4", "min_pct": 0.8, "max_pct": 0.9, "min_value": 160, "max_value": 179},
    {"zone": 5, "name": "Z5", "min_pct": 0.9, "max_pct": 1.0, "min_value": 180, "max_value": 250},
]


def _activity(start_time: str, avg_hr: int = 150) -> ActivityLike:
    return {
        "activity_id": "a1",
        "start_time": datetime.fromisoformat(start_time),
        "duration_s": 3600,
        "avg_hr": avg_hr,
        "avg_power": None,
    }


def test_evening_run_lands_on_the_athletes_day_not_the_utc_day() -> None:
    # 21:00Z on the 1st is 05:00 on the 2nd in Shanghai. Reading the aware
    # instant's date directly yields the 1st, which is the previous day.
    distribution = activity_distribution(
        _activity("2026-07-01T21:00:00+00:00"), [], ZONES, SHANGHAI
    )
    assert distribution.start_date.isoformat() == "2026-07-02"


def test_same_instant_reads_differently_east_and_west_of_utc() -> None:
    instant = "2026-07-01T21:00:00+00:00"
    east = activity_distribution(_activity(instant), [], ZONES, SHANGHAI)
    west = activity_distribution(_activity(instant), [], ZONES, NEW_YORK)
    utc = activity_distribution(_activity(instant), [], ZONES, "UTC")

    assert east.start_date.isoformat() == "2026-07-02"
    assert utc.start_date.isoformat() == "2026-07-01"
    assert west.start_date.isoformat() == "2026-07-01"
    assert east.start_date != utc.start_date


def test_morning_run_is_unchanged_across_zones() -> None:
    # 06:00Z on the 1st is 14:00 in Shanghai and 02:00 in New York — all on the
    # 1st. This is the case that hides the bug, which is why the evening cases
    # above carry the weight.
    instant = "2026-07-01T06:00:00+00:00"
    for zone in (SHANGHAI, "UTC", NEW_YORK):
        assert (
            activity_distribution(_activity(instant), [], ZONES, zone).start_date.isoformat()
            == "2026-07-01"
        )


def test_default_zone_is_utc_and_matches_explicit_utc() -> None:
    instant = "2026-07-01T21:00:00+00:00"
    default = activity_distribution(_activity(instant), [], ZONES)
    explicit = activity_distribution(_activity(instant), [], ZONES, "UTC")
    assert default.start_date == explicit.start_date


def test_unknown_zone_falls_back_to_utc_like_the_api_does() -> None:
    instant = "2026-07-01T21:00:00+00:00"
    assert (
        activity_distribution(_activity(instant), [], ZONES, "Not/AZone").start_date.isoformat()
        == "2026-07-01"
    )


def test_empty_distribution_still_carries_the_athletes_day() -> None:
    """The no-data paths return early; they still have to stamp the right day,
    or an activity with no HR data silently lands in the wrong week."""
    distribution = activity_distribution(
        _activity("2026-07-01T21:00:00+00:00", avg_hr=0), [], ZONES, SHANGHAI
    )
    assert distribution.start_date.isoformat() == "2026-07-02"
    assert distribution.source is None


def test_zone_boundaries_do_not_change_the_day() -> None:
    """Whatever branch computes the distribution, the day comes from the same
    place — the Z1 and Z5 edges are the two that pick a different code path."""
    for hr in (100, 250):
        distribution = activity_distribution(
            _activity("2026-07-01T21:00:00+00:00", avg_hr=hr), [], ZONES, SHANGHAI
        )
        assert distribution.start_date.isoformat() == "2026-07-02"


def test_per_sample_path_carries_the_athletes_day() -> None:
    """Streams present takes `_from_values`, a different branch from the
    session-mean path; both must agree on the day."""
    streams = [{"metric_type": "heart_rate", "value": 150}]
    distribution = activity_distribution(
        _activity("2026-07-01T21:00:00+00:00"), streams, ZONES, SHANGHAI
    )
    assert distribution.start_date.isoformat() == "2026-07-02"
    assert distribution.by_zone["z3"] > 0


def test_naive_timestamp_is_rejected_rather_than_assumed_utc() -> None:
    """A naive datetime has no zone to convert from, so no rule can pick the
    right day. Naming the bad row beats filing it under a plausible wrong one."""
    with pytest.raises(ValueError, match="timezone-aware"):
        activity_distribution(_activity("2026-07-01T21:00:00"), [], ZONES, SHANGHAI)


def test_missing_start_time_is_rejected() -> None:
    activity: ActivityLike = {"activity_id": "a1", "duration_s": 3600, "avg_hr": 150}
    with pytest.raises(ValueError, match="start_time"):
        activity_distribution(activity, [], ZONES, SHANGHAI)


def test_week_grouping_follows_the_corrected_day() -> None:
    """The whole reason this matters: 2026-07-01 is a Wednesday, 07-02 a
    Thursday, so both sit in the same Monday-anchored week. Pick an instant
    whose UTC day would fall into the *previous* week to prove the bucket."""
    # 23:30Z on Sunday 2026-07-05 is Monday the 6th in Shanghai (UTC+8).
    sunday_evening = activity_distribution(
        _activity("2026-07-05T23:30:00+00:00"), [], ZONES, SHANGHAI
    )
    buckets = weekly_breakdown([sunday_evening])
    assert len(buckets) == 1
    assert buckets[0]["week_start"].isoformat() == "2026-07-06"


def test_week_bucket_would_differ_under_the_utc_reading() -> None:
    """Pins the premise: the same session buckets to the previous week when the
    day is read in UTC, so this test cannot pass by accident."""
    instant = "2026-07-05T23:30:00+00:00"
    shanghai = activity_distribution(_activity(instant), [], ZONES, SHANGHAI)
    as_utc = activity_distribution(_activity(instant), [], ZONES, "UTC")

    shanghai_bucket = weekly_breakdown([shanghai])[0]["week_start"].isoformat()
    utc_bucket = weekly_breakdown([as_utc])[0]["week_start"].isoformat()
    assert shanghai_bucket == "2026-07-06"
    assert utc_bucket == "2026-06-29"
    assert shanghai_bucket != utc_bucket


def test_offset_aware_timestamp_is_honoured_regardless_of_utc_text() -> None:
    """An instant carrying +08:00 is already the athlete's wall clock; it must
    not be shifted again."""
    distribution = activity_distribution(
        _activity("2026-07-01T21:00:00+08:00"), [], ZONES, SHANGHAI
    )
    assert distribution.start_date.isoformat() == "2026-07-01"


def test_start_time_in_utc_zone_string() -> None:
    """Guards against a caller passing an aware instant built from a naive UTC
    assumption rather than a real offset."""
    instant = datetime(2026, 7, 1, 21, 0, tzinfo=UTC)
    distribution = activity_distribution(
        {"activity_id": "a", "start_time": instant, "duration_s": 3600, "avg_hr": 150},
        [],
        ZONES,
        SHANGHAI,
    )
    assert distribution.start_date.isoformat() == "2026-07-02"
