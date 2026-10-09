from datetime import date

import pytest

from domain.insights.adherence import (
    adherence_trend,
    compute_weekly_adherence,
    iso_week_start,
)


def test_adherence_on_track_when_80_to_110_pct() -> None:
    w = compute_weekly_adherence(date(2026, 7, 27), planned_tss=300, completed_tss=285)
    assert w.status == "on_track"
    assert w.adherence_pct == pytest.approx(95.0)


def test_adherence_under_when_below_80_pct() -> None:
    w = compute_weekly_adherence(date(2026, 7, 27), planned_tss=300, completed_tss=210)
    assert w.status == "under"


def test_adherence_over_when_above_110_pct() -> None:
    w = compute_weekly_adherence(date(2026, 7, 27), planned_tss=300, completed_tss=360)
    assert w.status == "over"


def test_adherence_no_plan_when_zero_planned() -> None:
    w = compute_weekly_adherence(date(2026, 7, 27), planned_tss=0, completed_tss=150)
    assert w.status == "no_plan"
    assert w.adherence_pct == 0.0


def test_iso_week_start_returns_monday() -> None:
    # 2026-07-29 is a Wednesday; Monday is 2026-07-27.
    assert iso_week_start(date(2026, 7, 29)) == date(2026, 7, 27)
    # 2026-07-27 is already a Monday.
    assert iso_week_start(date(2026, 7, 27)) == date(2026, 7, 27)
    # Sunday (day 6) rolls back to the prior Monday.
    assert iso_week_start(date(2026, 8, 2)) == date(2026, 7, 27)


def test_adherence_trend_empty_returns_no_data() -> None:
    assert adherence_trend([])["trend"] == "no_data"


def test_adherence_trend_all_no_plan() -> None:
    weeks = [compute_weekly_adherence(date(2026, 7, 27), 0, 100)]
    assert adherence_trend(weeks)["trend"] == "no_plan"


def test_adherence_trend_consistent_when_high_avg() -> None:
    weeks = [
        compute_weekly_adherence(date(2026, 7, 27), 300, 290),
        compute_weekly_adherence(date(2026, 7, 20), 300, 295),
    ]
    result = adherence_trend(weeks)
    assert result["trend"] == "consistent"
    assert result["on_track_weeks"] == 2


def test_adherence_trend_inconsistent_when_low_avg() -> None:
    weeks = [
        compute_weekly_adherence(date(2026, 7, 27), 300, 150),
        compute_weekly_adherence(date(2026, 7, 20), 300, 180),
    ]
    result = adherence_trend(weeks)
    assert result["trend"] == "inconsistent"
    assert result["avg_adherence_pct"] < 70


def test_weekly_adherence_carries_session_counts() -> None:
    w = compute_weekly_adherence(
        date(2026, 7, 27),
        planned_tss=300,
        completed_tss=300,
        sessions_completed=4,
        sessions_missed=1,
        sessions_extra=2,
    )
    assert w.sessions_completed == 4
    assert w.sessions_missed == 1
    assert w.sessions_extra == 2
