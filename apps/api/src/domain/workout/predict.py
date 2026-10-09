"""Project future TSS to CTL/ATL/TSB/ACWR with rule-based alerts. Pure domain."""

from dataclasses import dataclass
from datetime import date, timedelta

from domain.load.acwr import compute_acwr
from domain.load.constants import (
    ACWR_HIGH_RISK_THRESHOLD,
    ATL_DECAY_DAYS,
    CHRONIC_WINDOW_DAYS,
    CTL_DECAY_DAYS,
)

ONE_DAY = timedelta(days=1)

# Threshold constants
TSB_OVERTRAINING_THRESHOLD = -30.0
TSB_FRESH_LOW = 10.0
TSB_FRESH_HIGH = 25.0


@dataclass(frozen=True)
class PredictionPoint:
    """One projected day in the future schedule."""

    day: date
    projected_tss: float
    projected_ctl: float
    projected_atl: float
    projected_tsb: float
    projected_acwr: float | None
    is_overtraining_risk: bool  # TSB < -30
    is_high_load_risk: bool  # ACWR > 1.5
    is_fresh: bool  # TSB ∈ [+10, +25]


def project_future(
    historical_daily_tss: dict[date, float],
    planned_workouts: dict[date, float],
    current_ctl: float,
    current_atl: float,
    horizon_days: int = 28,
) -> list[PredictionPoint]:
    """Project horizon_days of CTL/ATL/TSB/ACWR from planned TSS.

    historical_daily_tss supplies ACWR context; planned_workouts maps
    future day → predicted TSS (missing days → 0 = rest).
    current_ctl/current_atl are the latest known values.
    """
    if horizon_days <= 0 or (not planned_workouts and not historical_daily_tss):
        return []

    projection_start = (
        max(historical_daily_tss) + ONE_DAY if historical_daily_tss else min(planned_workouts)
    )
    projection_end = projection_start + timedelta(days=horizon_days - 1)

    # Build contiguous daily timeline for ACWR (window before projection + projection).
    acwr_start = projection_start - timedelta(days=CHRONIC_WINDOW_DAYS - 1)
    if historical_daily_tss:
        acwr_start = min(acwr_start, *historical_daily_tss)

    daily_loads: list[float] = []
    acwr_dates: list[date] = []
    cursor = acwr_start
    while cursor <= projection_end:
        val = (
            historical_daily_tss[cursor]
            if cursor in historical_daily_tss
            else planned_workouts.get(cursor, 0.0)
        )
        daily_loads.append(val)
        acwr_dates.append(cursor)
        cursor += ONE_DAY

    acwr_values = compute_acwr(daily_loads)
    acwr_by_date: dict[date, float | None] = {
        d: acwr_values[i] if i < len(acwr_values) else None for i, d in enumerate(acwr_dates)
    }

    # Coggan EWMA projection
    points: list[PredictionPoint] = []
    ctl = current_ctl
    atl = current_atl
    for offset in range(horizon_days):
        day = projection_start + timedelta(days=offset)
        tss = planned_workouts.get(day, 0.0)
        ctl += (tss - ctl) / CTL_DECAY_DAYS
        atl += (tss - atl) / ATL_DECAY_DAYS
        tsb = ctl - atl
        acwr = acwr_by_date.get(day)
        points.append(
            PredictionPoint(
                day=day,
                projected_tss=tss,
                projected_ctl=ctl,
                projected_atl=atl,
                projected_tsb=tsb,
                projected_acwr=acwr,
                is_overtraining_risk=tsb < TSB_OVERTRAINING_THRESHOLD,
                is_high_load_risk=acwr is not None and acwr > ACWR_HIGH_RISK_THRESHOLD,
                is_fresh=TSB_FRESH_LOW <= tsb <= TSB_FRESH_HIGH,
            )
        )
    return points
