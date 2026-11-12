from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.plan.plan_context_io import (
    default_days_off,
    goal_title,
    load_goal,
    valid_days,
    validate_goal,
    validate_running_athlete,
)
from application.plan.plan_events import affected_dates, phase_preview, planned_events
from application.plan.plan_inputs import athlete_settings, recent_weekly_run_distance
from application.plan.plan_records import (
    insert_events,
    insert_phases,
    replace_future_generated_plan,
)
from application.plan.training_paces import (
    TrainingPaceStep,
    goal_training_paces,
    paces_for_date,
    training_pace_history,
)
from domain.workout.periodization import Phase, generate_phases
from infrastructure.repositories.plan_revisions import PlanRevisionRepo


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
    events = planned_events(context)
    preserved = await _preserved_future_rows(athlete_id, goal_id, context.now, db_conn)
    preserved_ids = {str(row["event_id"]) for row in preserved}
    writable = [event for event in events if str(event["event_id"]) not in preserved_ids]
    planned_dates = affected_dates(writable, context.timezone)
    result: dict[str, object] = {
        "phases_created": len(context.phases),
        "events_created": len(writable),
        "affected_dates": planned_dates,
        "preserved": [
            {
                "date": _iso_day(row["day"]),
                "name": str(row["name"] or ""),
                "reason": "done" if row["done"] else "athlete_edited",
            }
            for row in preserved
        ],
    }
    if context.dry_run:
        result.update(_preview_payload(context, writable))
        return result

    revision_id = await insert_plan_revision(
        athlete_id,
        goal_id,
        "generate",
        cast(list[dict[str, object]], [event["preview"] for event in writable]),
        [phase_preview(phase) for phase in context.phases],
    )
    await replace_future_generated_plan(
        athlete_id, goal_id, context.now, context.today, writable, db_conn
    )
    await insert_phases(athlete_id, goal_id, context.phases, context.today, db_conn)
    inserted = await insert_events(writable, db_conn, revision_id)
    await db_conn.commit()
    return {
        "phases_created": len(context.phases),
        "events_created": inserted,
        "preserved": result["preserved"],
    }


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


def _iso_day(value: object) -> str:
    """行里的本地日期转 ISO 文本；类型不对时直接暴露错误。"""
    if not isinstance(value, date):
        raise ValueError("保留课表行的日期列不是日期")
    return value.isoformat()


async def _preserved_future_rows(
    athlete_id: UUID,
    goal_id: UUID,
    now: datetime,
    db_conn: AsyncConnection[DictRow],
) -> list[dict[str, object]]:
    """该目标未来已被手动修改或已完成的课表行，重生成时保留。"""
    query = """
    SELECT event_id, name, done, athlete_edited,
           (start_time AT TIME ZONE (SELECT timezone FROM athletes WHERE id = athlete_id))::date
               AS day
    FROM training_calendar
    WHERE athlete_id = %s AND plan_goal_id = %s AND status <> 'deleted'
      AND start_time > %s AND (athlete_edited OR done)
    ORDER BY start_time
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, goal_id, now))
        rows = await cur.fetchall()
    return [dict(row) for row in rows]


async def insert_plan_revision(
    athlete_id: UUID,
    goal_id: UUID,
    reason: str,
    events: list[dict[str, object]],
    phases: list[dict[str, object]],
) -> UUID:
    """写入本次生成的完整快照。"""
    return await PlanRevisionRepo().insert(athlete_id, goal_id, reason, events, phases)


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
