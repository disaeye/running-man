"""TDD tests for CTL/ATL/TSB/ACWR projection engine."""

from datetime import date, timedelta

from domain.load.pmc import compute_ctl_atl_tsb
from domain.workout.predict import (
    TSB_FRESH_HIGH,
    TSB_FRESH_LOW,
    TSB_OVERTRAINING_THRESHOLD,
    PredictionPoint,
    project_future,
)


def test_high_risk_schedule() -> None:
    """30-day baseline at 100, then 7 days at 300 → ACWR > 1.5 flagged."""
    start = date(2026, 1, 1)
    historical = {start + timedelta(days=i): 100.0 for i in range(30)}
    planned = {start + timedelta(days=30 + i): 300.0 for i in range(7)}

    metrics = compute_ctl_atl_tsb(historical)
    points = project_future(
        historical_daily_tss=historical,
        planned_workouts=planned,
        current_ctl=metrics["ctl"][-1],
        current_atl=metrics["atl"][-1],
        horizon_days=7,
    )

    assert any(p.is_high_load_risk for p in points)
    assert any(p.projected_acwr is not None and p.projected_acwr > 1.5 for p in points)


def test_overtraining() -> None:
    """30-day moderate baseline (70), then 14 days at 350 → TSB < -30."""
    start = date(2026, 2, 1)
    historical = {start + timedelta(days=i): 70.0 for i in range(30)}
    planned = {start + timedelta(days=30 + i): 350.0 for i in range(14)}

    metrics = compute_ctl_atl_tsb(historical)
    points = project_future(
        historical_daily_tss=historical,
        planned_workouts=planned,
        current_ctl=metrics["ctl"][-1],
        current_atl=metrics["atl"][-1],
        horizon_days=14,
    )

    assert any(p.is_overtraining_risk for p in points)
    assert any(p.projected_tsb < TSB_OVERTRAINING_THRESHOLD for p in points)


def test_fresh_taper() -> None:
    """Hard block (21 days at 200) then deep taper (14 days at 20) → TSB +10~+25."""
    start = date(2026, 3, 1)
    historical = {start + timedelta(days=i): 200.0 for i in range(21)}
    planned = {start + timedelta(days=21 + i): 20.0 for i in range(14)}

    metrics = compute_ctl_atl_tsb(historical)
    points = project_future(
        historical_daily_tss=historical,
        planned_workouts=planned,
        current_ctl=metrics["ctl"][-1],
        current_atl=metrics["atl"][-1],
        horizon_days=14,
    )

    assert any(p.is_fresh for p in points)
    assert any(TSB_FRESH_LOW <= p.projected_tsb <= TSB_FRESH_HIGH for p in points)


def test_horizon_controls_output_length() -> None:
    """Output list length matches horizon_days."""
    start = date(2026, 4, 1)
    historical = {start + timedelta(days=i): 100.0 for i in range(14)}
    planned = {start + timedelta(days=14 + i): 120.0 for i in range(14)}

    metrics = compute_ctl_atl_tsb(historical)
    points = project_future(
        historical_daily_tss=historical,
        planned_workouts=planned,
        current_ctl=metrics["ctl"][-1],
        current_atl=metrics["atl"][-1],
        horizon_days=21,
    )

    assert len(points) == 21


def test_empty_input_returns_empty() -> None:
    """No historical or planned data → empty list."""
    assert project_future({}, {}, 0.0, 0.0) == []


def test_single_day_output_structure() -> None:
    """Single projected day has all fields populated correctly."""
    start = date(2026, 5, 1)
    historical = {start: 100.0}
    planned = {start + timedelta(days=1): 200.0}

    metrics = compute_ctl_atl_tsb(historical)
    points = project_future(
        historical_daily_tss=historical,
        planned_workouts=planned,
        current_ctl=metrics["ctl"][-1],
        current_atl=metrics["atl"][-1],
        horizon_days=1,
    )

    assert len(points) == 1
    p = points[0]
    assert isinstance(p, PredictionPoint)
    assert p.day == start + timedelta(days=1)
    assert p.projected_tss == 200.0
    assert p.projected_ctl > 0
    assert p.projected_atl > 0
    assert isinstance(p.projected_acwr, float)
    assert isinstance(p.is_overtraining_risk, bool)
    assert isinstance(p.is_high_load_risk, bool)
    assert isinstance(p.is_fresh, bool)


def test_zero_horizon_returns_empty() -> None:
    """horizon_days=0 → empty list (no crash)."""
    start = date(2026, 6, 1)
    points = project_future(
        {start: 100.0}, {start + timedelta(days=1): 100.0}, 50.0, 50.0, horizon_days=0
    )
    assert points == []
