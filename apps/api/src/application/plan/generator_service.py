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
from domain.workout.plan_generator import generate_weekly_plan
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


async def generate_plan(
    athlete_id: UUID,
    goal_id: UUID,
    db_conn: AsyncConnection[DictRow],
    dry_run: bool = False,
    rest_days: int | None = None,
    preferred_days_off: list[int] | None = None,
    weekly_tss: float | None = None,
) -> dict[str, object]:
    goal = await _load_goal(athlete_id, goal_id, db_conn)
    target_date = goal.get("target_date")
    if not isinstance(target_date, date):
        raise ValueError("目标日期为必填项")

    settings = await athlete_settings(athlete_id, db_conn)
    timezone = ZoneInfo(settings.timezone)
    today = datetime.now(timezone).date()
    if target_date < today:
        raise ValueError("目标日期已过去")

    ctl, load_available = await current_ctl(athlete_id, today, db_conn)
    goal_tss = goal_weekly_tss(goal)
    effective_weekly_tss = weekly_tss if weekly_tss is not None else goal_tss
    if effective_weekly_tss is None and not load_available:
        raise ValueError("训练负荷历史不足，请填写每周目标 TSS")
    if effective_weekly_tss is not None and effective_weekly_tss <= 0:
        raise ValueError("每周目标 TSS 必须大于零")

    sport = SPORT_BY_GOAL.get(str(goal.get("type") or "").strip().lower(), "Run")
    count_rest = rest_days if rest_days is not None else 7 - settings.weekly_training_days
    days_off = (
        _valid_days(preferred_days_off)
        if preferred_days_off is not None
        else _default_days_off(target_date, today, count_rest)
    )
    if len(days_off) > count_rest:
        raise ValueError("偏好休息日数量不能超过每周休息日数量")
    phases = generate_phases(target_date, ctl, today, effective_weekly_tss)
    if not phases or all(phase.name == "race" for phase in phases):
        raise ValueError("目标日期至少需要七天准备时间")
    paces = await training_pace_history(athlete_id, target_date, db_conn)
    if not paces:
        paces = goal_training_paces(goal)
    options = ScheduleOptions(
        rest_days=min(max(count_rest, 0), 6),
        preferred_days_off=days_off,
        max_session_duration_min=settings.max_session_duration_min,
    )
    now = datetime.now(UTC)
    context = PlanContext(
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
        now,
    )
    events = _planned_events(context)
    planned_dates = affected_dates(events, timezone)
    result: dict[str, object] = {
        "phases_created": len(phases),
        "events_created": len(events),
        "affected_dates": planned_dates,
    }
    if dry_run:
        result.update(
            {
                "phases": [phase_preview(phase) for phase in phases],
                "events": [event["preview"] for event in events],
                "training_paces_available": any(
                    paces_for_date(paces, phase.start_date) is not None for phase in phases
                ),
                "training_load_available": load_available,
            }
        )
        return result

    await replace_future_generated_plan(athlete_id, goal_id, now, today, events, db_conn)
    await insert_phases(athlete_id, goal_id, phases, today, db_conn)
    inserted = await insert_events(events, db_conn)
    await db_conn.commit()
    return {"phases_created": len(phases), "events_created": inserted}


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
    first_week_start = context.today - timedelta(days=context.today.weekday())
    for phase in context.phases:
        week_start = phase.start_date - timedelta(days=phase.start_date.weekday())
        while week_start <= phase.end_date:
            week_number = max((week_start - first_week_start).days // 7, 0)
            for day_offset in range(7):
                event_day = week_start + timedelta(days=day_offset)
                if event_day < max(phase.start_date, context.today) or event_day > phase.end_date:
                    continue
                if context.race_title is not None and event_day == context.race_date:
                    continue
                day = generate_weekly_plan(
                    phase.target_weekly_tss,
                    context.sport,
                    context.options.rest_days,
                    context.options.preferred_days_off,
                    paces_for_date(context.paces, event_day),
                    week_number,
                    max_session_duration_min=context.options.max_session_duration_min,
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
