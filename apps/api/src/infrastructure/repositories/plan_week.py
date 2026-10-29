"""Reading the data the plan page shows.

The plan page needs three things: the planned sessions of the week, the
activities of the week, and the daily load facts of the week. They live in
three different tables and are read here, once, so the endpoint that uses them
stays about assembling the answer rather than about SQL.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Final
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

# 一周有七天。
WEEK_DAYS: Final = 7


async def week_sessions(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    week_start: date,
    week_end: date,
) -> list[dict[str, object]]:
    """The planned sessions of one week, as plain dicts.

    The prescription is returned whole: the page reads its pace range and its
    duration from it, and the adjustment flow rewrites it.
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT event_id, start_time, name, training_type, predicted_tss,
                   predicted_distance_m, workout_prescription, done
            FROM training_calendar
            WHERE athlete_id = %s AND status <> 'deleted'
              AND (start_time AT TIME ZONE (SELECT timezone FROM athletes WHERE id = %s))::date
                  BETWEEN %s AND %s
            ORDER BY start_time
            """,
            (athlete_id, athlete_id, week_start, week_end),
        )
        rows = await cur.fetchall()

    sessions: list[dict[str, object]] = []
    for row in rows:
        start_time = row.get("start_time")
        if not isinstance(start_time, datetime):
            continue
        prescription = row.get("workout_prescription")
        segments: dict[str, object] = prescription if isinstance(prescription, dict) else {}
        sessions.append(
            {
                "event_id": str(row.get("event_id")),
                "date": start_time.date(),
                "title": str(row.get("name") or ""),
                "training_type": row.get("training_type"),
                "duration_min": segments.get("duration_min"),
                "predicted_tss": row.get("predicted_tss"),
                "predicted_distance_m": row.get("predicted_distance_m"),
                "pace_min_s_km": segments.get("pace_min_s_km"),
                "pace_max_s_km": segments.get("pace_max_s_km"),
                "is_completed": bool(row.get("done")),
            }
        )
    return sessions


async def week_activities(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    week_start: date,
    week_end: date,
) -> list[dict[str, object]]:
    """The activities of one week, for the plan-versus-actual numbers."""
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT a.distance_m
            FROM activity_compute a
            JOIN athletes athlete ON athlete.id = a.athlete_id
            WHERE a.athlete_id = %s
              AND (a.start_time AT TIME ZONE athlete.timezone)::date BETWEEN %s AND %s
            """,
            (athlete_id, week_start, week_end),
        )
        rows = await cur.fetchall()
    return [dict(row) for row in rows]


async def week_loads(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    week_start: date,
    week_end: date,
) -> list[dict[str, object]]:
    """The daily load facts of one week."""
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT day, metric_key, value
            FROM current_daily_facts
            WHERE athlete_id = %s AND day BETWEEN %s AND %s
              AND metric_key = 'tss'
            ORDER BY day
            """,
            (athlete_id, week_start, week_end),
        )
        rows = await cur.fetchall()
    return [dict(row) for row in rows]
