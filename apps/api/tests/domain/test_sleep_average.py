"""The 7-day sleep average must divide by measured nights only.

Computed in `presentation.api.coach_context._recovery_signals`, which is pure
arithmetic over wellness rows, so it is tested here without a database.

The average used to be `sum(values) / len(values)` over `ordered[-7:]`, wrong
twice over. `[-7:]` is the last seven *rows* rather than the last seven days,
and the divisor counted rows whose sleep was null — charging an unknown night as
zero hours. On the athlete this was found on, the reported figure was 3.8 h
against a true 4.48 h: a 15% error in the number shown directly under "睡眠" on
the home screen, biased in the direction that makes recovery look worse.
"""

from __future__ import annotations

from datetime import date

from presentation.api.coach_context import _recovery_signals


def _signals(rows: list[dict[str, object]], target: date) -> dict[str, object]:
    return _recovery_signals(rows, {"score": 60}, target)


def test_skips_null_rows_instead_of_counting_them_as_zero() -> None:
    # Three nights measured, one day with no record. The average of the measured
    # nights is 8 h; counting the empty day would make it 6 h.
    rows = [
        {"day": date(2026, 9, 11), "sleep_secs": 28800},
        {"day": date(2026, 9, 12), "sleep_secs": None},
        {"day": date(2026, 9, 13), "sleep_secs": 28800},
        {"day": date(2026, 9, 14), "sleep_secs": 28800},
    ]

    assert _signals(rows, date(2026, 9, 14))["sleep_avg_7d"] == 8.0


def test_uses_a_seven_day_window_not_the_last_seven_rows() -> None:
    # Sparse wellness: only four rows exist, spread over three weeks. The two
    # inside the window average 6 h; the older pair must not be pulled in just to
    # fill seven slots.
    rows = [
        {"day": date(2026, 8, 20), "sleep_secs": 3600},
        {"day": date(2026, 8, 25), "sleep_secs": 3600},
        {"day": date(2026, 9, 10), "sleep_secs": 21600},
        {"day": date(2026, 9, 12), "sleep_secs": 21600},
    ]

    assert _signals(rows, date(2026, 9, 14))["sleep_avg_7d"] == 6.0


def test_includes_the_window_boundary_day() -> None:
    # The window is inclusive of target - 6, so a night exactly seven days back
    # counts.
    rows = [
        {"day": date(2026, 9, 8), "sleep_secs": 25200},
        {"day": date(2026, 9, 14), "sleep_secs": 25200},
    ]

    assert _signals(rows, date(2026, 9, 14))["sleep_avg_7d"] == 7.0


def test_ignores_days_after_the_target() -> None:
    rows = [
        {"day": date(2026, 9, 12), "sleep_secs": 25200},
        {"day": date(2026, 9, 20), "sleep_secs": 3600},
    ]

    assert _signals(rows, date(2026, 9, 14))["sleep_avg_7d"] == 7.0


def test_reports_zero_when_nothing_was_measured() -> None:
    rows = [{"day": date(2026, 9, 14), "sleep_secs": None}]

    assert _signals(rows, date(2026, 9, 14))["sleep_avg_7d"] == 0.0


def test_no_rows_at_all_is_zero_not_a_crash() -> None:
    assert _signals([], date(2026, 9, 14))["sleep_avg_7d"] == 0.0


# ---------------------------------------------------------------------------
# Trend direction — the same window bug as the sleep average
# ---------------------------------------------------------------------------


def _trend(rows: list[dict[str, object]], field: str, target: date) -> str:
    from presentation.api.coach_context import _trend as impl

    return impl(rows, field, target)


def test_trend_ignores_readings_outside_the_window() -> None:
    """A stale reading must not be compared against today's.

    The window used to be the last seven *rows*. With sparse wellness that
    reached back months, so a June reading was compared against a September one
    and reported as this week's direction — a confident claim built from data
    the window was supposed to exclude.
    """
    rows = [
        {"day": date(2026, 6, 1), "hrv": 100},
        {"day": date(2026, 7, 1), "hrv": 100},
        {"day": date(2026, 8, 1), "hrv": 100},
        {"day": date(2026, 8, 20), "hrv": 100},
        {"day": date(2026, 9, 5), "hrv": 100},
        {"day": date(2026, 9, 12), "hrv": 40},
        {"day": date(2026, 9, 13), "hrv": 40},
    ]

    # Only two readings fall inside the window, and TREND_MIN_POINTS is 2, so a
    # direction is reported — but it must come from those two, not from June.
    # Both in-window readings are 40, so the trend is flat.
    assert _trend(rows, "hrv", date(2026, 9, 14)) == "stable"


def test_trend_reports_up_for_a_rising_week() -> None:
    rows = [
        {"day": date(2026, 9, day), "hrv": value}
        for day, value in [(9, 50), (10, 52), (11, 54), (12, 56), (14, 62)]
    ]

    assert _trend(rows, "hrv", date(2026, 9, 14)) == "up"


def test_trend_reports_down_for_a_falling_week() -> None:
    rows = [
        {"day": date(2026, 9, day), "hrv": value}
        for day, value in [(9, 62), (10, 60), (11, 58), (12, 56), (14, 50)]
    ]

    assert _trend(rows, "hrv", date(2026, 9, 14)) == "down"


def test_trend_is_stable_with_a_single_reading() -> None:
    # Below TREND_MIN_POINTS (2) there is nothing to compare, so the answer is
    # stable rather than a direction extrapolated from one value.
    rows = [{"day": date(2026, 9, 13), "hrv": 90}]

    assert _trend(rows, "hrv", date(2026, 9, 14)) == "stable"


def test_trend_treats_a_small_change_as_stable() -> None:
    # A one-unit move is inside the noise floor the implementation defines.
    rows = [
        {"day": date(2026, 9, day), "hrv": value}
        for day, value in [(9, 50), (10, 50), (11, 50), (12, 50), (14, 51)]
    ]

    assert _trend(rows, "hrv", date(2026, 9, 14)) == "stable"
