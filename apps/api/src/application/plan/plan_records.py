from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from typing import cast
from uuid import UUID, uuid5
from zoneinfo import ZoneInfo

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.workout.periodization import Phase
from domain.workout.plan_generator import PlannedDay

PLAN_NAMESPACE = UUID("cb6e2c29-61e6-43ff-ae44-2da0224a93c8")


def event_record(
    athlete_id: UUID,
    goal_id: UUID,
    sport: str,
    event_day: date,
    day: PlannedDay,
    phase_name: str,
    timezone: ZoneInfo,
) -> dict[str, object]:
    event_id = f"plan:{goal_id}:{uuid5(PLAN_NAMESPACE, f'{goal_id}:{event_day.isoformat()}')}"
    start_time = datetime.combine(event_day, time(hour=6), tzinfo=timezone)
    name = f"{day.description}（{day.duration_min} 分钟）" if day.duration_min else day.description
    prescription = {
        "version": 1,
        "type": day.workout_type,
        "duration_min": day.duration_min,
        "pace_min_s_km": day.pace_min_s_km,
        "pace_max_s_km": day.pace_max_s_km,
        "segments": list(day.workout_segments),
        "phase": phase_name,
    }
    return {
        "event_id": event_id,
        "athlete_id": athlete_id,
        "start_time": start_time,
        "name": name,
        "predicted_tss": round(day.target_tss, 1),
        "sport_type": sport,
        "plan_goal_id": goal_id,
        "plan_source": "generator",
        "training_type": day.workout_type,
        "workout_prescription": prescription,
        "preview": {
            "event_id": event_id,
            "date": event_day.isoformat(),
            "name": name,
            "training_type": day.workout_type,
            "category": "workout",
            "duration_min": day.duration_min,
            "predicted_tss": round(day.target_tss, 1),
            "pace_min_s_km": day.pace_min_s_km,
            "pace_max_s_km": day.pace_max_s_km,
            "segments": list(day.workout_segments),
            "phase": phase_name,
        },
    }


def race_event_record(
    athlete_id: UUID,
    goal_id: UUID,
    sport: str,
    event_day: date,
    title: str,
    timezone: ZoneInfo,
) -> dict[str, object]:
    event_id = f"plan:{goal_id}:{uuid5(PLAN_NAMESPACE, f'{goal_id}:{event_day.isoformat()}')}"
    start_time = datetime.combine(event_day, time(hour=6), tzinfo=timezone)
    name = f"比赛日 · {title}"
    return {
        "event_id": event_id,
        "athlete_id": athlete_id,
        "start_time": start_time,
        "name": name,
        "predicted_tss": 0.0,
        "sport_type": sport,
        "category": "workout",
        "plan_goal_id": goal_id,
        "plan_source": "generator",
        "training_type": "race",
        "workout_prescription": None,
        "preview": {
            "event_id": event_id,
            "date": event_day.isoformat(),
            "name": name,
            "training_type": "race",
            "category": "workout",
            "duration_min": 0,
            "predicted_tss": 0.0,
            "pace_min_s_km": None,
            "pace_max_s_km": None,
            "segments": [],
            "phase": "race",
        },
    }


def phase_preview(phase: Phase) -> dict[str, object]:
    return {
        "name": phase.name,
        "start_date": phase.start_date.isoformat(),
        "end_date": phase.end_date.isoformat(),
        "target_weekly_tss": round(phase.target_weekly_tss, 1),
    }


async def replace_future_generated_plan(
    athlete_id: UUID,
    goal_id: UUID,
    now: datetime,
    today: date,
    events: list[dict[str, object]],
    db_conn: AsyncConnection[DictRow],
) -> None:
    async with db_conn.cursor() as cur:
        replacement_ids = [str(event["event_id"]) for event in events]
        if replacement_ids:
            _ = await cur.execute(
                "UPDATE training_calendar SET status = 'deleted' "
                "WHERE athlete_id = %s AND plan_goal_id = %s AND plan_source = 'generator' "
                "AND athlete_edited = false AND done = false AND status = 'planned' "
                "AND start_time > %s AND event_id <> ALL(%s)",
                (athlete_id, goal_id, now, replacement_ids),
            )
        else:
            _ = await cur.execute(
                "UPDATE training_calendar SET status = 'deleted' "
                "WHERE athlete_id = %s AND plan_goal_id = %s AND plan_source = 'generator' "
                "AND athlete_edited = false AND done = false AND status = 'planned' "
                "AND start_time > %s",
                (athlete_id, goal_id, now),
            )
        _ = await cur.execute(
            "UPDATE training_phases SET end_date = %s "
            "WHERE athlete_id = %s AND goal_id = %s "
            "AND start_date < %s AND end_date >= %s",
            (today - timedelta(days=1), athlete_id, goal_id, today, today),
        )
        _ = await cur.execute(
            "DELETE FROM training_phases WHERE athlete_id = %s AND goal_id = %s "
            "AND start_date >= %s",
            (athlete_id, goal_id, today),
        )


async def insert_phases(
    athlete_id: UUID,
    goal_id: UUID,
    phases: list[Phase],
    today: date,
    db_conn: AsyncConnection[DictRow],
) -> None:
    query = """
    INSERT INTO training_phases (
        athlete_id, goal_id, name, start_date, end_date, target_weekly_tss
    ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    async with db_conn.cursor() as cur:
        for phase in phases:
            if phase.end_date < today:
                continue
            _ = await cur.execute(
                query,
                (
                    athlete_id,
                    goal_id,
                    phase.name,
                    max(phase.start_date, today),
                    phase.end_date,
                    phase.target_weekly_tss,
                ),
            )


async def insert_events(events: list[dict[str, object]], db_conn: AsyncConnection[DictRow]) -> int:
    query = """
    INSERT INTO training_calendar (
        event_id, athlete_id, start_time, category, sport_type, name, predicted_tss, status, done,
        plan_goal_id, plan_source, training_type, workout_prescription, athlete_edited
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'planned', false, %s, %s, %s, %s::jsonb, false)
    ON CONFLICT (event_id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        sport_type = EXCLUDED.sport_type,
        name = EXCLUDED.name,
        predicted_tss = EXCLUDED.predicted_tss,
        category = EXCLUDED.category,
        plan_goal_id = EXCLUDED.plan_goal_id,
        plan_source = EXCLUDED.plan_source,
        training_type = EXCLUDED.training_type,
        workout_prescription = EXCLUDED.workout_prescription,
        status = 'planned'
    WHERE training_calendar.athlete_id = EXCLUDED.athlete_id
      AND training_calendar.plan_goal_id = EXCLUDED.plan_goal_id
      AND training_calendar.plan_source = 'generator'
      AND training_calendar.status = 'planned'
      AND training_calendar.athlete_edited = false
      AND training_calendar.done = false
      AND training_calendar.start_time > now()
    """
    inserted = 0
    async with db_conn.cursor() as cur:
        for event in events:
            _ = await cur.execute(
                query,
                (
                    event["event_id"],
                    event["athlete_id"],
                    event["start_time"],
                    event.get("category", "workout"),
                    event["sport_type"],
                    event["name"],
                    event["predicted_tss"],
                    event["plan_goal_id"],
                    event["plan_source"],
                    event["training_type"],
                    json.dumps(event["workout_prescription"], ensure_ascii=True),
                ),
            )
            inserted += cur.rowcount
    return inserted


def affected_dates(events: list[dict[str, object]], timezone: ZoneInfo) -> list[date]:
    return sorted(
        cast(datetime, event["start_time"]).astimezone(timezone).date() for event in events
    )
