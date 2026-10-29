"""从健康读数与 PMC 负荷中整理恢复信号。"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Literal

from domain.insights.recovery_projection import project_recovery

TrendDirection = Literal["up", "down", "stable"]
WEEK_DAYS = 7
TREND_MIN_POINTS = 2


def recovery_signals(
    wellness: Sequence[dict[str, object]],
    readiness: dict[str, object],
    target_day: date,
    pmc_loads: Sequence[dict[str, object]] = (),
) -> dict[str, object]:
    """Return measured recovery trends and the seven-day sleep mean."""
    ordered = sorted(wellness, key=_row_day)
    window_start = target_day - timedelta(days=WEEK_DAYS - 1)
    measured = [
        _num(row.get("sleep_secs")) / 3600
        for row in ordered
        if row.get("sleep_secs") is not None and window_start <= _row_day(row) <= target_day
    ]
    return {
        "hrv_trend_direction": trend(ordered, "hrv", target_day),
        "rhr_trend_direction": trend(ordered, "resting_hr", target_day),
        "sleep_avg_7d": round(sum(measured) / len(measured), 1) if measured else 0.0,
        "readiness_score": readiness["score"],
        "tsb_recovery_days": tsb_recovery_days(pmc_loads),
    }


def tsb_recovery_days(loads: Sequence[dict[str, object]]) -> int | None:
    """Project the recovery day using the PMC decay constants, with no planned load."""
    ctl: float | None = None
    atl: float | None = None
    for row in reversed(loads):
        if ctl is None:
            value = row.get("ctl")
            if isinstance(value, int | float) and value > 0:
                ctl = float(value)
        if atl is None:
            value = row.get("atl")
            if isinstance(value, int | float) and value > 0:
                atl = float(value)
        if ctl is not None and atl is not None:
            break
    if ctl is None or atl is None:
        return None
    return project_recovery(ctl, atl).days


def trend(rows: Sequence[dict[str, object]], field: str, target_day: date) -> TrendDirection:
    """Compare measured points inside the actual seven-day window."""
    window_start = target_day - timedelta(days=WEEK_DAYS - 1)
    values = [
        _num(row.get(field))
        for row in sorted(rows, key=_row_day)
        if row.get(field) is not None and window_start <= _row_day(row) <= target_day
    ]
    if len(values) < TREND_MIN_POINTS:
        return "stable"
    delta = values[-1] - values[0]
    if delta > 1:
        return "up"
    if delta < -1:
        return "down"
    return "stable"


def _row_day(row: dict[str, object]) -> date:
    value = row["day"]
    return value if isinstance(value, date) else date.min


def _num(value: object) -> float:
    if isinstance(value, int | float):
        return float(value)
    if value is None:
        return 0.0
    return float(str(value))
