from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import TypedDict

NO_PLAN_LABEL = "无计划"


class WeekProgress(TypedDict):
    week: str
    planned_tss: float
    actual_tss: float
    planned_sessions: int
    actual_sessions: int
    completion_pct: int | str
    planned_distance_m: float
    actual_distance_m: float


def compute_weekly_progress(
    planned_events: list[dict[str, object]],
    activities: list[dict[str, object]],
    start: date,
    end: date,
) -> list[WeekProgress]:
    planned = _aggregate_planned(planned_events, start, end)
    actual = _aggregate_actual(activities, start, end)
    weeks: list[WeekProgress] = []
    current = week_start(start)
    while current <= week_start(end):
        week = _iso_week(current)
        weeks.append(_week_progress(week, planned[week], actual[week]))
        current += timedelta(days=7)
    return weeks


def in_range(row: dict[str, object], start: date, end: date) -> bool:
    row_date = as_date(row.get("start_time"))
    return start <= row_date <= end


def as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def num(value: object) -> float:
    return float(value) if isinstance(value, int | float | Decimal) else 0.0


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _aggregate_planned(
    planned_events: list[dict[str, object]], start: date, end: date
) -> defaultdict[str, dict[str, float]]:
    totals: defaultdict[str, dict[str, float]] = defaultdict(_empty_totals)
    for event in planned_events:
        if not in_range(event, start, end):
            continue
        week = totals[_iso_week(as_date(event.get("start_time")))]
        week["tss"] += num(event.get("predicted_tss"))
        week["sessions"] += 1
    return totals


def _aggregate_actual(
    activities: list[dict[str, object]], start: date, end: date
) -> defaultdict[str, dict[str, float]]:
    totals: defaultdict[str, dict[str, float]] = defaultdict(_empty_totals)
    for activity in activities:
        if not in_range(activity, start, end):
            continue
        week = totals[_iso_week(as_date(activity.get("start_time")))]
        week["tss"] += num(activity.get("tss"))
        week["sessions"] += 1
        week["distance_m"] += num(activity.get("distance_m"))
    return totals


def _week_progress(week: str, planned: dict[str, float], actual: dict[str, float]) -> WeekProgress:
    return {
        "week": week,
        "planned_tss": round(planned["tss"], 1),
        "actual_tss": round(actual["tss"], 1),
        "planned_sessions": round(planned["sessions"]),
        "actual_sessions": round(actual["sessions"]),
        "completion_pct": _completion_pct(planned["tss"], actual["tss"]),
        "planned_distance_m": round(planned["distance_m"], 1),
        "actual_distance_m": round(actual["distance_m"], 1),
    }


def _iso_week(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def _empty_totals() -> dict[str, float]:
    return {"tss": 0.0, "sessions": 0.0, "distance_m": 0.0}


def _completion_pct(planned_tss: float, actual_tss: float) -> int | str:
    return NO_PLAN_LABEL if planned_tss <= 0 else round(actual_tss / planned_tss * 100)
