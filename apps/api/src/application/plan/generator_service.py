from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.plan.plan_context_io import (
    default_days_off,
    goal_title,
    load_goal,
    sorted_events,
    valid_days,
    validate_goal,
    validate_running_athlete,
)
from application.plan.plan_inputs import athlete_settings, recent_weekly_run_distance
from application.plan.plan_records import (
    affected_dates,
    event_record,
    insert_events,
    insert_phases,
    phase_preview,
    race_event_record,
    replace_future_generated_plan,
)
from application.plan.training_paces import (
    TrainingPaceStep,
    goal_training_paces,
    pace_anchors,
    pace_step_for_date,
    paces_for_date,
    training_pace_history,
)
from domain.workout.periodization import Phase, generate_phases
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from domain.workout.prescription import REST


@dataclass(frozen=True)
class ScheduleOptions:
    rest_days: int
    preferred_days_off: list[int]
    max_session_duration_min: int
    # 运动员指定的长距离日（星期几）。为 None 时由生成器自行安排。
    long_run_day: int | None = None


@dataclass(frozen=True)
class PlanRequest:
    """What the caller asks a generated plan to look like.

    Grouped into one object because the generator's parameters had grown past
    the point where a caller could tell them apart by position.
    """

    dry_run: bool = False
    rest_days: int | None = None
    preferred_days_off: list[int] | None = None
    today: date | None = None
    long_run_day: int | None = None


@dataclass(frozen=True)
class PlanContext:
    athlete_id: UUID
    goal_id: UUID
    phases: list[Phase]
    sport: str
    timezone: ZoneInfo
    today: date
    options: ScheduleOptions
    paces: tuple[TrainingPaceStep, ...]
    race_date: date
    race_title: str | None
    now: datetime
    # 预览模式：只算出计划，不写入数据库。
    dry_run: bool = False
    # 近期完整周内有实际跑步记录的周数。
    running_history_weeks: int = 0
    race_distance_m: float = 0.0


async def generate_plan(
    athlete_id: UUID,
    goal_id: UUID,
    db_conn: AsyncConnection[DictRow],
    request: PlanRequest | None = None,
) -> dict[str, object]:
    context = await _plan_context(athlete_id, goal_id, db_conn, request or PlanRequest())
    events = _planned_events(context)
    planned_dates = affected_dates(events, context.timezone)
    result: dict[str, object] = {
        "phases_created": len(context.phases),
        "events_created": len(events),
        "affected_dates": planned_dates,
    }
    if context.dry_run:
        result.update(_preview_payload(context, events))
        return result

    await replace_future_generated_plan(
        athlete_id, goal_id, context.now, context.today, events, db_conn
    )
    await insert_phases(athlete_id, goal_id, context.phases, context.today, db_conn)
    inserted = await insert_events(events, db_conn)
    await db_conn.commit()
    return {"phases_created": len(context.phases), "events_created": inserted}


def _preview_payload(context: PlanContext, events: list[dict[str, object]]) -> dict[str, object]:
    """The extra fields a dry run returns."""
    return {
        "phases": [phase_preview(phase) for phase in context.phases],
        "events": [event["preview"] for event in events],
        "training_paces_available": any(
            paces_for_date(context.paces, phase.start_date) is not None for phase in context.phases
        ),
        "running_history_weeks": context.running_history_weeks,
    }


async def _plan_context(
    athlete_id: UUID,
    goal_id: UUID,
    db_conn: AsyncConnection[DictRow],
    request: PlanRequest,
) -> PlanContext:
    """Read everything a generated plan depends on, and validate it."""
    goal = await load_goal(athlete_id, goal_id, db_conn)
    target_date, race_distance_value = validate_goal(goal)
    await validate_running_athlete(athlete_id, db_conn)

    settings = await athlete_settings(athlete_id, db_conn)
    timezone = ZoneInfo(settings.timezone)
    today = request.today or datetime.now(timezone).date()
    if target_date < today:
        raise ValueError("目标日期已过去")

    baseline_weekly_distance_m, running_history_weeks = await recent_weekly_run_distance(
        athlete_id, today, db_conn
    )
    sport = "Run"
    count_rest = (
        request.rest_days if request.rest_days is not None else 7 - settings.weekly_training_days
    )
    days_off = (
        valid_days(request.preferred_days_off)
        if request.preferred_days_off is not None
        else default_days_off(target_date, today, count_rest)
    )
    if len(days_off) > count_rest:
        raise ValueError("偏好休息日数量不能超过每周休息日数量")
    paces = await training_pace_history(athlete_id, target_date, db_conn)
    if not paces:
        paces = goal_training_paces(goal)
    if not paces:
        raise ValueError("缺少有效阈值配速或比赛目标用时，无法安排训练配速")
    phases = generate_phases(target_date, baseline_weekly_distance_m, today)
    if not phases or all(phase.name == "race" for phase in phases):
        raise ValueError("目标日期至少需要七天准备时间")
    options = ScheduleOptions(
        rest_days=min(max(count_rest, 0), 6),
        preferred_days_off=days_off,
        max_session_duration_min=settings.max_session_duration_min,
        long_run_day=request.long_run_day,
    )
    return PlanContext(
        athlete_id,
        goal_id,
        phases,
        sport,
        timezone,
        today,
        options,
        paces,
        target_date,
        goal_title(goal),
        datetime.now(UTC),
        request.dry_run,
        running_history_weeks,
        race_distance_value,
    )


def _planned_events(context: PlanContext) -> list[dict[str, object]]:
    planned: list[dict[str, object]] = []
    for phase in context.phases:
        week_start = phase.start_date - timedelta(days=phase.start_date.weekday())
        # Week number is phase-relative: the 4th week of a build block is where
        # the recovery week belongs. Counting from the start of the whole plan
        # put it at an arbitrary point inside a phase.
        phase_week_start = week_start
        while week_start <= phase.end_date:
            week_number = max((week_start - phase_week_start).days // 7, 0)
            weekly_distance = phase.weekly_distance_for(week_start)
            pace_step = pace_step_for_date(context.paces, week_start)
            weekly_plan = generate_weekly_plan(
                weekly_distance,
                WeekPlanOptions(
                    sport=context.sport,
                    rest_days=context.options.rest_days,
                    preferred_days_off=context.options.preferred_days_off,
                    training_paces=paces_for_date(context.paces, week_start),
                    week_number=(phase_week_start - phase.start_date).days // 7 + week_number,
                    max_session_duration_min=context.options.max_session_duration_min,
                    long_run_day=context.options.long_run_day,
                    pace_effective_from=(
                        pace_step.effective_from.isoformat() if pace_step else None
                    ),
                    pace_source_refs=(pace_step.source_refs if pace_step else ()),
                    pace_anchors=pace_anchors(pace_step) if pace_step else None,
                    plan_date=week_start,
                ),
            )
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
                )
                if cast(datetime, event["start_time"]) > context.now:
                    planned.append(event)
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
