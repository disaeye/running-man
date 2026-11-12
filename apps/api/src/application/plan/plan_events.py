"""按周期内每周生成课表事件，含预计 TSS 与比赛日。"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, cast
from zoneinfo import ZoneInfo

from application.plan.plan_context_io import sorted_events
from application.plan.plan_records import event_record, race_event_record
from application.plan.training_paces import (
    pace_anchors,
    pace_step_for_date,
    paces_for_date,
)
from domain.workout.periodization import Phase
from domain.workout.plan_generator import PlannedDay, WeekPlanOptions, generate_weekly_plan
from domain.workout.prescription import REST
from domain.workout.tss_estimate import estimate_session_tss

if TYPE_CHECKING:
    # 只在类型检查时导入，避免与 generator_service 的运行时循环依赖。
    from application.plan.generator_service import PlanContext


def phase_preview(phase: "Phase") -> dict[str, object]:
    return {
        "name": phase.name,
        "start_date": phase.start_date.isoformat(),
        "end_date": phase.end_date.isoformat(),
        "target_weekly_distance_m": round(phase.target_weekly_distance_m, 1),
    }


def affected_dates(events: list[dict[str, object]], timezone: ZoneInfo) -> list[date]:
    return sorted(
        cast(datetime, event["start_time"]).astimezone(timezone).date() for event in events
    )


def planned_events(context: "PlanContext") -> list[dict[str, object]]:
    """逐阶段逐周生成全部未来课表事件。"""
    planned: list[dict[str, object]] = []
    for phase in context.phases:
        week_start = phase.start_date - timedelta(days=phase.start_date.weekday())
        # Week number is phase-relative: the 4th week of a build block is where
        # the recovery week belongs. Counting from the start of the whole plan
        # put it at an arbitrary point inside a phase.
        phase_week_start = week_start
        while week_start <= phase.end_date:
            _append_week(context, phase, week_start, phase_week_start, planned)
            week_start += timedelta(days=7)

    if context.race_title is not None:
        planned.append(
            race_event_record(
                context.athlete_id,
                context.goal_id,
                context.sport,
                context.race_date,
                context.race_title,
                context.race_distance_m,
                context.timezone,
            )
        )
    return sorted_events(planned)


def _append_week(
    context: "PlanContext",
    phase: Phase,
    week_start: date,
    phase_week_start: date,
    planned: list[dict[str, object]],
) -> None:
    week_number = max((week_start - phase_week_start).days // 7, 0)
    weekly_distance = phase.weekly_distance_for(week_start)
    pace_step = pace_step_for_date(context.paces, week_start)
    week_paces = paces_for_date(context.paces, week_start)
    weekly_plan = generate_weekly_plan(
        weekly_distance,
        WeekPlanOptions(
            sport=context.sport,
            rest_days=context.options.rest_days,
            preferred_days_off=context.options.preferred_days_off,
            training_paces=week_paces,
            week_number=(phase_week_start - phase.start_date).days // 7 + week_number,
            max_session_duration_min=context.options.max_session_duration_min,
            long_run_day=context.options.long_run_day,
            pace_effective_from=(pace_step.effective_from.isoformat() if pace_step else None),
            pace_source_refs=(pace_step.source_refs if pace_step else ()),
            pace_anchors=pace_anchors(pace_step) if pace_step else None,
            plan_date=week_start,
            race_distance_m=context.race_distance_m,
            phase_name=phase.name,
        ),
    )
    threshold_pace = threshold_pace_midpoint(week_paces)
    for day_offset in range(7):
        event_day = week_start + timedelta(days=day_offset)
        if event_day < max(phase.start_date, context.today) or event_day > phase.end_date:
            continue
        if context.race_title is not None and event_day == context.race_date:
            continue
        day = weekly_plan[day_offset]
        if day.workout_type == REST:
            continue
        event = event_record(
            context.athlete_id,
            context.goal_id,
            context.sport,
            event_day,
            day,
            phase.name,
            context.timezone,
            predicted_tss=session_tss(day, threshold_pace),
        )
        if cast(datetime, event["start_time"]) > context.now:
            planned.append(event)


def threshold_pace_midpoint(week_paces: dict[str, dict[str, float]] | None) -> float | None:
    """当周阈值配速区间的中点（秒每公里）。"""
    if not week_paces:
        return None
    threshold = week_paces.get("threshold")
    if not threshold:
        return None
    low = threshold.get("min")
    high = threshold.get("max")
    if not isinstance(low, int | float) or not isinstance(high, int | float):
        return None
    return (float(low) + float(high)) / 2.0


def session_tss(day: PlannedDay, threshold_pace: float | None) -> float | None:
    """一节课的预计 TSS；缺配速时返回 None，不编造数值。"""
    if (
        threshold_pace is None
        or day.pace_min_s_km is None
        or day.pace_max_s_km is None
        or day.pace_min_s_km <= 0
        or day.pace_max_s_km <= 0
    ):
        return None
    mean_pace = (day.pace_min_s_km + day.pace_max_s_km) / 2.0
    return estimate_session_tss(day.duration_min, mean_pace, threshold_pace)


def _timezone_guard(_tz: ZoneInfo) -> ZoneInfo:
    """类型引用占位：让 ZoneInfo 导入对类型检查可见。"""
    return _tz
