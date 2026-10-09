from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

Row = dict[str, object]


@dataclass(frozen=True)
class TaperAssessment:
    is_tapering: bool
    freshness_ok: bool
    recommended_reduction_pct: float
    days_to_race: int | None


def assess_taper(daily_loads: list[Row], race_date: date | None) -> TaperAssessment:
    """Detect race-window tapering, week-over-week TSS reduction, and TSB freshness."""
    days_to_race = _days_to_race(daily_loads, race_date)
    should_taper = days_to_race is not None and 7 <= days_to_race <= 21
    current_week, previous_week = _week_totals(daily_loads)
    is_reducing = _reduction_pct(previous_week, current_week) > 15.0
    has_intensity = current_week > 0
    freshness_ok = _latest_tsb(daily_loads) > 10.0
    return TaperAssessment(
        is_tapering=should_taper and is_reducing and has_intensity,
        freshness_ok=freshness_ok,
        recommended_reduction_pct=15.0 if should_taper else 0.0,
        days_to_race=days_to_race,
    )


def _days_to_race(daily_loads: list[Row], race_date: date | None) -> int | None:
    if race_date is None:
        return None
    load_days = [_as_date(row.get("day")) for row in daily_loads if row.get("day") is not None]
    if not load_days:
        return None
    return (race_date - max(load_days)).days


def _week_totals(daily_loads: list[Row]) -> tuple[float, float]:
    ordered = sorted(daily_loads, key=lambda row: _as_date(row.get("day")))
    current_week = sum(_num(row.get("tss")) for row in ordered[-7:])
    previous_week = sum(_num(row.get("tss")) for row in ordered[-14:-7])
    return current_week, previous_week


def _reduction_pct(previous_week: float, current_week: float) -> float:
    if previous_week <= 0:
        return 0.0
    return max(0.0, (previous_week - current_week) / previous_week * 100.0)


def _latest_tsb(daily_loads: list[Row]) -> float:
    if not daily_loads:
        return 0.0
    latest = max(daily_loads, key=lambda row: _as_date(row.get("day")))
    return _num(latest.get("tsb"))


def _as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _num(value: object) -> float:
    return float(value) if isinstance(value, int | float | Decimal) else 0.0
