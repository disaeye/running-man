from datetime import date, timedelta
from itertools import pairwise
from typing import Literal, TypedDict

from domain.insights.weekly_progress import (
    WeekProgress,
    as_date,
    compute_weekly_progress,
    in_range,
    num,
    week_start,
)

VOLUME_ADEQUACY_WEIGHT = 30.0
INTENSITY_DISTRIBUTION_WEIGHT = 25.0
REST_DAY_PLACEMENT_WEIGHT = 20.0
SESSION_SPACING_WEIGHT = 15.0
WEEKLY_CONSISTENCY_WEIGHT = 10.0

A_GRADE_MIN_SCORE = 85
B_PLUS_GRADE_MIN_SCORE = 70
B_GRADE_MIN_SCORE = 55

LOW_INTENSITY_TSS_MAX = 50.0
HIGH_INTENSITY_TSS_MIN = 100.0
POLARIZED_LOW_INTENSITY_MIN_RATIO = 0.70
POLARIZED_HIGH_INTENSITY_MAX_RATIO = 0.25
MIN_REST_DAYS_PER_WEEK = 1
MAX_ITEMS_PER_SECTION = 3
MIN_WELL_MATCHED_VOLUME_RATIO = 0.85
MAX_WELL_MATCHED_VOLUME_RATIO = 1.10
MIN_DAYS_FOR_SPACING = 2
MAX_CLOSE_HIGH_INTENSITY_RATIO = 0.25
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
    planned_days: set[date]
    actual_days: set[date]


def compute_plan_quality(
    planned_events: list[dict[str, object]],
    activities: list[dict[str, object]],
    start: date,
    end: date,
) -> PlanQuality:
    inputs = _plan_inputs(planned_events, activities, start, end)
    if not inputs["planned_tss"]:
        return _quality(0.0, [], ["所选周期没有训练计划"], ["先为本周安排至少3次训练"])
    parts = {
        "volume": _volume_score(inputs["weeks"]),
        "intensity": _intensity_score(inputs["planned_tss"]),
        "rest": _rest_score(inputs["planned_days"], start, end),
        "spacing": _spacing_score(inputs["planned_days"], inputs["planned_tss"]),
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
) -> PlanInputs:
    planned_tss = [
        num(event.get("predicted_tss")) for event in planned_events if in_range(event, start, end)
    ]
    return {
        "weeks": compute_weekly_progress(planned_events, activities, start, end),
        "planned_tss": [tss for tss in planned_tss if tss > 0],
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
    planned = sum(float(week["planned_tss"]) for week in weeks)
    actual = sum(float(week["actual_tss"]) for week in weeks)
    if planned <= 0:
        return 0.0
    ratio = actual / planned
    if MIN_WELL_MATCHED_VOLUME_RATIO <= ratio <= MAX_WELL_MATCHED_VOLUME_RATIO:
        return VOLUME_ADEQUACY_WEIGHT
    return max(0.0, VOLUME_ADEQUACY_WEIGHT * (1 - min(abs(1 - ratio), 1)))


def _intensity_score(planned_tss: list[float]) -> float:
    low = sum(1 for tss in planned_tss if tss <= LOW_INTENSITY_TSS_MAX) / len(planned_tss)
    high = sum(1 for tss in planned_tss if tss >= HIGH_INTENSITY_TSS_MIN) / len(planned_tss)
    low_score = min(low / POLARIZED_LOW_INTENSITY_MIN_RATIO, 1.0) * 0.6
    high_score = (1.0 if high <= POLARIZED_HIGH_INTENSITY_MAX_RATIO else 0.5) * 0.4
    return (low_score + high_score) * INTENSITY_DISTRIBUTION_WEIGHT


def _rest_score(planned_days: set[date], start: date, end: date) -> float:
    scores: list[float] = []
    current = week_start(start)
    while current <= week_start(end):
        sessions = sum(1 for day in planned_days if current <= day < current + timedelta(days=7))
        if sessions:
            scores.append(1.0 if 7 - sessions >= MIN_REST_DAYS_PER_WEEK else 0.0)
        current += timedelta(days=7)
    return _avg(scores) * REST_DAY_PLACEMENT_WEIGHT


def _spacing_score(planned_days: set[date], planned_tss: list[float]) -> float:
    if len(planned_days) < MIN_DAYS_FOR_SPACING:
        return SESSION_SPACING_WEIGHT
    sorted_days = sorted(planned_days)
    close_pairs = sum(1 for first, second in pairwise(sorted_days) if (second - first).days <= 1)
    high_ratio = sum(1 for tss in planned_tss if tss >= HIGH_INTENSITY_TSS_MIN) / len(planned_tss)
    if close_pairs == 0 or high_ratio <= MAX_CLOSE_HIGH_INTENSITY_RATIO:
        return SESSION_SPACING_WEIGHT
    return SESSION_SPACING_WEIGHT * 0.5


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
