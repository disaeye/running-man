from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Literal, TypedDict

from domain.insights.domain_tid import domain_intensity_score
from domain.insights.plan_intensity import (
    INTENSITY_DISTRIBUTION_WEIGHT,
    SESSION_SPACING_WEIGHT,
    intensity_score,
    session_duration,
    spacing_score,
)
from domain.insights.plan_segments import (
    aggregate_execution_segment_facts,
    aggregate_plan_segment_facts,
)
from domain.insights.session_domains import aggregate_domain_seconds
from domain.insights.weekly_progress import (
    WeekProgress,
    as_date,
    compute_weekly_progress,
    in_range,
    num,
    week_start,
)

VOLUME_ADEQUACY_WEIGHT = 30.0
REST_DAY_PLACEMENT_WEIGHT = 20.0
WEEKLY_CONSISTENCY_WEIGHT = 10.0

A_GRADE_MIN_SCORE = 85
B_PLUS_GRADE_MIN_SCORE = 70
B_GRADE_MIN_SCORE = 55

MIN_REST_DAYS_PER_WEEK = 1
MAX_ITEMS_PER_SECTION = 3
MIN_WELL_MATCHED_VOLUME_RATIO = 0.85
MAX_WELL_MATCHED_VOLUME_RATIO = 1.10
Grade = Literal["A", "B+", "B", "C"]


class PlanQuality(TypedDict):
    grade: Grade
    score: int
    strengths: list[str]
    risks: list[str]
    recommendations: list[str]


class PlanInputs(TypedDict):
    weeks: list[WeekProgress]
    planned_tss: list[float]
    planned_types: list[str]
    planned_durations: list[float]
    planned_days: set[date]
    actual_days: set[date]


def compute_plan_quality(
    planned_events: list[dict[str, object]],
    activities: list[dict[str, object]],
    start: date,
    end: date,
    classifications: Sequence[Mapping[str, object]] | None = None,
) -> PlanQuality:
    inputs = _plan_inputs(planned_events, activities, start, end, classifications)
    if not inputs["planned_tss"]:
        return _quality(0.0, [], ["所选周期没有训练计划"], ["先为本周安排至少3次训练"])
    planned_facts = aggregate_plan_segment_facts(planned_events)
    execution_facts = aggregate_execution_segment_facts(classifications or [])
    measured_intensity = domain_intensity_score(aggregate_domain_seconds(classifications or []))
    parts = {
        "volume": _volume_from_ratio(
            execution_facts["work_distance_m"]
            or sum(float(week["work_distance_m"]) for week in inputs["weeks"]),
            planned_facts["work_distance_m"]
            or sum(float(week["planned_distance_m"]) for week in inputs["weeks"]),
        ),
        "intensity": measured_intensity
        if measured_intensity is not None
        else intensity_score(
            inputs["planned_types"], inputs["planned_durations"], inputs["planned_tss"]
        ),
        "rest": _rest_score(inputs["planned_days"], start, end),
        "spacing": spacing_score(inputs["planned_days"], inputs["planned_types"]),
        "consistency": _consistency_score(inputs["planned_days"], inputs["actual_days"]),
    }
    return _quality(sum(parts.values()), _strengths(parts), _risks(parts), _recommendations(parts))


def evaluate_plan_quality(weeks: list[WeekProgress]) -> PlanQuality:
    if not any(week["planned_sessions"] for week in weeks):
        return _quality(0.0, [], ["所选周期没有训练计划"], ["先为本周安排至少3次训练"])
    parts = {
        "volume": _volume_score(weeks),
        "intensity": INTENSITY_DISTRIBUTION_WEIGHT * 0.6,
        "rest": _count_rest_score(weeks),
        "spacing": SESSION_SPACING_WEIGHT,
        "consistency": _session_consistency_score(weeks),
    }
    return _quality(sum(parts.values()), _strengths(parts), _risks(parts), _recommendations(parts))


def _plan_inputs(
    planned_events: list[dict[str, object]],
    activities: list[dict[str, object]],
    start: date,
    end: date,
    classifications: Sequence[Mapping[str, object]] | None = None,
) -> PlanInputs:
    planned_tss = [
        num(event.get("predicted_tss")) for event in planned_events if in_range(event, start, end)
    ]
    planned_types = [
        str(event.get("training_type"))
        for event in planned_events
        if in_range(event, start, end)
        and isinstance(event.get("training_type"), str)
        and num(event.get("predicted_tss")) > 0
    ]
    planned_durations = [
        session_duration(event)
        for event in planned_events
        if in_range(event, start, end)
        and isinstance(event.get("training_type"), str)
        and num(event.get("predicted_tss")) > 0
    ]
    return {
        "weeks": compute_weekly_progress(planned_events, activities, start, end, classifications),
        "planned_tss": [tss for tss in planned_tss if tss > 0],
        "planned_types": planned_types,
        "planned_durations": planned_durations,
        "planned_days": {
            as_date(event.get("start_time"))
            for event in planned_events
            if in_range(event, start, end)
        },
        "actual_days": {
            as_date(row.get("start_time")) for row in activities if in_range(row, start, end)
        },
    }


def _volume_score(weeks: list[WeekProgress]) -> float:
    """Compare planned work distance with measured per-segment work distance."""
    planned_distance = sum(float(week["planned_distance_m"]) for week in weeks)
    measured_distance = sum(float(week["work_distance_m"]) for week in weeks)
    if any(week["classification_count"] > 0 for week in weeks):
        return _volume_from_ratio(measured_distance, planned_distance)
    planned = sum(float(week["planned_tss"]) for week in weeks)
    actual = sum(float(week["actual_tss"]) for week in weeks)
    return _volume_from_ratio(actual, planned)


def _volume_from_ratio(actual: float, planned: float) -> float:
    if planned <= 0:
        return 0.0
    ratio = actual / planned
    if MIN_WELL_MATCHED_VOLUME_RATIO <= ratio <= MAX_WELL_MATCHED_VOLUME_RATIO:
        return VOLUME_ADEQUACY_WEIGHT
    return max(0.0, VOLUME_ADEQUACY_WEIGHT * (1 - min(abs(1 - ratio), 1)))


def _rest_score(planned_days: set[date], start: date, end: date) -> float:
    scores: list[float] = []
    current = week_start(start)
    while current <= week_start(end):
        sessions = sum(1 for day in planned_days if current <= day < current + timedelta(days=7))
        if sessions:
            scores.append(1.0 if 7 - sessions >= MIN_REST_DAYS_PER_WEEK else 0.0)
        current += timedelta(days=7)
    return _avg(scores) * REST_DAY_PLACEMENT_WEIGHT


def _consistency_score(planned_days: set[date], actual_days: set[date]) -> float:
    return len(planned_days & actual_days) / len(planned_days) * WEEKLY_CONSISTENCY_WEIGHT


def _count_rest_score(weeks: list[WeekProgress]) -> float:
    scores = [
        1.0 if 7 - int(week["planned_sessions"]) >= 1 else 0.0
        for week in weeks
        if week["planned_sessions"]
    ]
    return _avg(scores) * REST_DAY_PLACEMENT_WEIGHT


def _session_consistency_score(weeks: list[WeekProgress]) -> float:
    planned = sum(int(week["planned_sessions"]) for week in weeks)
    actual = sum(int(week["actual_sessions"]) for week in weeks)
    return min(actual / planned, 1.0) * WEEKLY_CONSISTENCY_WEIGHT if planned else 0.0


def _quality(
    score: float, strengths: list[str], risks: list[str], recommendations: list[str]
) -> PlanQuality:
    final_score = max(0, min(100, round(score)))
    return {
        "grade": _grade(final_score),
        "score": final_score,
        "strengths": strengths[:3],
        "risks": risks[:3],
        "recommendations": recommendations[:3],
    }


def _strengths(parts: dict[str, float]) -> list[str]:
    labels = {
        "volume": "计划与实际训练量匹配良好",
        "intensity": "强度分布偏低强度为主",
        "rest": "恢复日安排得当",
        "spacing": "训练间隔合理",
        "consistency": "训练执行稳定",
    }
    return _section(labels, parts, 0.8, at_least=True)


def _risks(parts: dict[str, float]) -> list[str]:
    labels = {
        "volume": "实际 TSS 与计划偏差较大",
        "intensity": "高强度或中等强度占比偏高",
        "rest": "每周恢复日不足",
        "spacing": "高TSS训练间隔过短",
        "consistency": "计划课表完成率偏低",
    }
    return _section(labels, parts, 0.6, at_least=False)


def _recommendations(parts: dict[str, float]) -> list[str]:
    labels = {
        "volume": "将周训练TSS调整到实际可完成范围",
        "intensity": "增加轻松训练比例，减少连续高强度安排",
        "rest": "每7天至少保留1天恢复或休息",
        "spacing": "高TSS训练之间间隔至少48小时",
        "consistency": "优先完成关键训练，降低非关键课表数量",
    }
    return _section(labels, parts, 0.8, at_least=False)


def _section(
    labels: dict[str, str], parts: dict[str, float], threshold: float, *, at_least: bool
) -> list[str]:
    weights = {
        "volume": VOLUME_ADEQUACY_WEIGHT,
        "intensity": INTENSITY_DISTRIBUTION_WEIGHT,
        "rest": REST_DAY_PLACEMENT_WEIGHT,
        "spacing": SESSION_SPACING_WEIGHT,
        "consistency": WEEKLY_CONSISTENCY_WEIGHT,
    }
    return [
        label
        for key, label in labels.items()
        if (parts[key] >= weights[key] * threshold) is at_least
    ][:MAX_ITEMS_PER_SECTION]


def _grade(score: int) -> Grade:
    if score >= A_GRADE_MIN_SCORE:
        return "A"
    if score >= B_PLUS_GRADE_MIN_SCORE:
        return "B+"
    return "B" if score >= B_GRADE_MIN_SCORE else "C"


def _avg(scores: list[float]) -> float:
    return sum(scores) / len(scores) if scores else 0.0
