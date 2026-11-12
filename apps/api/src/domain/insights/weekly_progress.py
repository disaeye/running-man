from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import TypedDict

from domain.insights.plan_segments import work_from_segments
from domain.insights.session_domains import (
    DomainSeconds,
    aggregate_domain_seconds,
    domain_share,
)
from domain.insights.session_load import weekly_session_load
from domain.insights.session_quality import quality_matches

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
    # 实际累计爬升（米）。
    actual_elevation_m: float
    # 平均配速（秒/公里），按距离与时长算出；没有距离时为 None。
    avg_pace_s_per_km: float | None
    # 计划距离目标之差（米）：正数表示还差多少。
    remaining_distance_m: float
    # 工作段在 ACSM/ESSA 四强度域的秒数与占比。
    work_domain_seconds: DomainSeconds
    work_domain_share: dict[str, float]
    # 五对象的逐段质量指标，作为周负荷与趋势的共同定义。
    quality_matches: dict[str, float | None]
    classification_count: int
    # 来自 execution.segments 的共享逐段负荷定义，TSS 为无分类时的回退。
    work_bouts: int
    work_distance_m: float
    work_duration_s: float


def compute_weekly_progress(
    planned_events: list[dict[str, object]],
    activities: list[dict[str, object]],
    start: date,
    end: date,
    classifications: Sequence[Mapping[str, object]] | None = None,
) -> list[WeekProgress]:
    planned = _aggregate_planned(planned_events, start, end)
    actual = _aggregate_actual(activities, start, end)
    domains = _domain_by_week(classifications or [])
    quality_by_week = _quality_by_week(classifications or [])
    count_by_week = _count_by_week(classifications or [])
    loads = weekly_session_load(classifications or [])
    weeks: list[WeekProgress] = []
    current = week_start(start)
    while current <= week_start(end):
        week = _iso_week(current)
        seconds: DomainSeconds = domains.get(week) or aggregate_domain_seconds([])
        weeks.append(
            _week_progress(
                week,
                planned[week],
                actual[week],
                seconds,
                quality_by_week.get(week),
                count_by_week.get(week, 0),
                loads.get(week),
            )
        )
        current += timedelta(days=7)
    return weeks


def _week_key(classification: Mapping[str, object]) -> str:
    day = classification.get("local_day")
    local_day = day if isinstance(day, date) else date.fromisoformat(str(day)[:10])
    return _iso_week(week_start(local_day))


def _quality_by_week(
    classifications: Sequence[Mapping[str, object]],
) -> dict[str, dict[str, float | None]]:
    grouped: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in classifications:
        grouped[_week_key(row)].append(row)
    return {
        week: {
            "type_match": matches["type_match"],
            "structure_match": matches["structure_match"],
            "domain_match": matches["domain_match"],
        }
        for week, rows in grouped.items()
        for matches in (quality_matches(rows),)
    }


def _count_by_week(
    classifications: Sequence[Mapping[str, object]],
) -> dict[str, int]:
    result: dict[str, int] = defaultdict(int)
    for row in classifications:
        result[_week_key(row)] += 1
    return result


def _domain_by_week(
    classifications: Sequence[Mapping[str, object]],
) -> dict[str, DomainSeconds]:
    grouped: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in classifications:
        grouped[_week_key(row)].append(row)
    return {week: aggregate_domain_seconds(rows) for week, rows in grouped.items()}


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
        # 计划与完成记录共用逐段定义：存在 workout_prescription.segments
        # 时，计划工作里程取工作段 target 之和；整场 predicted_distance_m
        # 只在没有逐段处方时作为总量回退。
        prescription = event.get("workout_prescription")
        segments = prescription.get("segments") if isinstance(prescription, dict) else None
        segment_distance = work_from_segments(segments)["work_distance_m"]
        week["distance_m"] += (
            segment_distance if segment_distance > 0 else num(event.get("predicted_distance_m"))
        )
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
        week["elevation_m"] += num(activity.get("elevation_gain_m"))
        week["duration_s"] += num(activity.get("duration_s"))
    return totals


def _week_progress(
    week: str,
    planned: dict[str, float],
    actual: dict[str, float],
    domain_seconds: DomainSeconds,
    weekly_quality: dict[str, float | None] | None,
    classification_count: int,
    load: object,
) -> WeekProgress:
    planned_distance = planned["distance_m"]
    actual_distance = actual["distance_m"]
    matches = weekly_quality or {
        "type_match": None,
        "structure_match": None,
        "domain_match": None,
    }
    facts = load if isinstance(load, Mapping) else {}
    work_distance_m = float(facts.get("work_distance_m") or 0.0)
    work_duration_s = float(facts.get("work_duration_s") or 0.0)
    work_bouts = int(facts.get("work_bouts") or 0)
    completion_pct = (
        _completion_pct(planned_distance, work_distance_m)
        if classification_count > 0 and work_distance_m > 0
        else _completion_pct(planned["tss"], actual["tss"])
    )
    return {
        "week": week,
        "planned_tss": round(planned["tss"], 1),
        "actual_tss": round(actual["tss"], 1),
        "planned_sessions": round(planned["sessions"]),
        "actual_sessions": round(actual["sessions"]),
        "completion_pct": completion_pct,
        "planned_distance_m": round(planned_distance, 1),
        "actual_distance_m": round(actual_distance, 1),
        "actual_elevation_m": round(actual["elevation_m"], 1),
        "avg_pace_s_per_km": _avg_pace(actual_distance, actual["duration_s"]),
        "remaining_distance_m": round(max(planned_distance - actual_distance, 0.0), 1),
        "work_domain_seconds": domain_seconds,
        "work_domain_share": domain_share(domain_seconds),
        "quality_matches": matches,
        "classification_count": classification_count,
        "work_bouts": work_bouts,
        "work_distance_m": round(work_distance_m, 1),
        "work_duration_s": round(work_duration_s, 1),
    }


def _avg_pace(distance_m: float, duration_s: float) -> float | None:
    """Seconds per kilometre for a week.

    ``None`` when the week has no distance: a pace without distance would be a
    division by nothing.
    """
    if distance_m <= 0 or duration_s <= 0:
        return None
    return round(duration_s / (distance_m / 1000.0), 1)


def _iso_week(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def _empty_totals() -> dict[str, float]:
    return {
        "tss": 0.0,
        "sessions": 0.0,
        "distance_m": 0.0,
        "elevation_m": 0.0,
        "duration_s": 0.0,
    }


def _completion_pct(planned_tss: float, actual_tss: float) -> int | str:
    return NO_PLAN_LABEL if planned_tss <= 0 else round(actual_tss / planned_tss * 100)
