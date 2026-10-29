from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.plan.plan_inputs import athlete_settings, current_ctl, goal_weekly_tss
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
    paces_for_date,
    training_pace_history,
)
from domain.workout.periodization import Phase, generate_phases
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from domain.workout.prescription import REST

WEEKDAY_MAX = 6
SPORT_BY_GOAL = {
    "bike": "Bike",
    "cycling": "Bike",
    "ride": "Bike",
    "swim": "Swim",
    "swimming": "Swim",
}


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
    weekly_tss: float | None = None
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
    # 是否有可用的负荷历史；没有时计划需要运动员自己给出每周目标。
    load_available: bool = False


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
        "training_load_available": context.load_available,
    }


async def _plan_context(
    athlete_id: UUID,
    goal_id: UUID,
    db_conn: AsyncConnection[DictRow],
    request: PlanRequest,
) -> PlanContext:
    """Read everything a generated plan depends on, and validate it."""
    goal = await _load_goal(athlete_id, goal_id, db_conn)
    target_date = goal.get("target_date")
    if not isinstance(target_date, date):
        raise ValueError("目标日期为必填项")

    settings = await athlete_settings(athlete_id, db_conn)
    timezone = ZoneInfo(settings.timezone)
    today = request.today or datetime.now(timezone).date()
    if target_date < today:
        raise ValueError("目标日期已过去")

    ctl, load_available = await current_ctl(athlete_id, today, db_conn)
    goal_tss = goal_weekly_tss(goal)
    weekly_tss = request.weekly_tss if request.weekly_tss is not None else goal_tss
    if weekly_tss is None and not load_available:
        raise ValueError("训练负荷历史不足，请填写每周目标 TSS")
    if weekly_tss is not None and weekly_tss <= 0:
        raise ValueError("每周目标 TSS 必须大于零")

    sport = SPORT_BY_GOAL.get(str(goal.get("type") or "").strip().lower(), "Run")
    count_rest = (
        request.rest_days if request.rest_days is not None else 7 - settings.weekly_training_days
    )
    days_off = (
        _valid_days(request.preferred_days_off)
        if request.preferred_days_off is not None
        else _default_days_off(target_date, today, count_rest)
    )
    if len(days_off) > count_rest:
        raise ValueError("偏好休息日数量不能超过每周休息日数量")
    phases = generate_phases(target_date, ctl, today, weekly_tss)
    if not phases or all(phase.name == "race" for phase in phases):
        raise ValueError("目标日期至少需要七天准备时间")
    paces = await training_pace_history(athlete_id, target_date, db_conn)
    if not paces:
        paces = goal_training_paces(goal)
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
        str(goal.get("title") or "比赛") if goal.get("type") == "event" else None,
        datetime.now(UTC),
        request.dry_run,
        load_available,
    )


async def _load_goal(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object]:
    query = """
    SELECT goal_id, athlete_id, type::text AS type, title, target_value,
           unit::text AS unit, target_date, race_distance_m, race_target_time_s
    FROM goals
    WHERE athlete_id = %s AND goal_id = %s AND status <> 'abandoned'
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, goal_id))
        row = await cur.fetchone()
    if row is None:
        raise ValueError("找不到训练目标")
    return dict(row)


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
            weekly_tss = phase.weekly_tss_for(week_start)
            for day_offset in range(7):
                event_day = week_start + timedelta(days=day_offset)
                if event_day < max(phase.start_date, context.today) or event_day > phase.end_date:
                    continue
                if context.race_title is not None and event_day == context.race_date:
                    continue
                day = generate_weekly_plan(
                    weekly_tss,
                    WeekPlanOptions(
                        sport=context.sport,
                        rest_days=context.options.rest_days,
                        preferred_days_off=context.options.preferred_days_off,
                        training_paces=paces_for_date(context.paces, event_day),
                        week_number=week_number,
                        max_session_duration_min=context.options.max_session_duration_min,
                        long_run_day=context.options.long_run_day,
                    ),
                )[day_offset]
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
                context.timezone,
            )
        )
    return sorted(planned, key=lambda event: cast(datetime, event["start_time"]))


def _valid_days(days: list[int] | None) -> list[int]:
    if days is None:
        return []
    return sorted({day for day in days if 0 <= day <= WEEKDAY_MAX})


def _default_days_off(race_date: date, today: date, rest_days: int) -> list[int]:
    _ = race_date, today
    return [5, 2, 0, 4, 1, 3, 6][: min(max(rest_days, 0), 7)]
