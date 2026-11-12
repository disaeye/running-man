import json
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from typing import cast
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from infrastructure.db.pool import get_pool, open_pool


async def _connect() -> AbstractAsyncContextManager[psycopg.AsyncConnection[DictRow]]:
    await open_pool()
    return cast(
        AbstractAsyncContextManager[psycopg.AsyncConnection[DictRow]], get_pool().connection()
    )


def _jsonb(value: object) -> str | None:
    return json.dumps(value, ensure_ascii=True) if value is not None else None


class CalendarRepo:
    async def list(
        self, athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        async with await _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT event_id, start_time, category, sport_type, name, workout_xml,
                       predicted_tss, predicted_distance_m, external_id, status, done,
                       plan_goal_id, plan_source, training_type, workout_prescription,
                       athlete_edited, linked_activity_id, completed_distance_m,
                       completed_duration_s, completed_avg_hr, completed_rpe,
                       actual_logged_at, execution, quality, session_classification
                FROM training_calendar
                WHERE athlete_id = %s AND start_time BETWEEN %s AND %s
                  AND status <> 'deleted'
                ORDER BY start_time
                """,
                (athlete_id, start, end),
            )
            return list(await cur.fetchall())

    async def create(self, athlete_id: UUID, event: dict[str, object]) -> dict[str, object]:
        async with await _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO training_calendar
                (event_id, athlete_id, start_time, category, sport_type, name,
                 workout_xml, predicted_tss, predicted_distance_m, status, done,
                 plan_goal_id, plan_source, training_type, workout_prescription,
                 athlete_edited, execution, quality, session_classification)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, COALESCE(%s, 'planned'),
                        COALESCE(%s, false), %s, %s, %s, %s::jsonb,
                        COALESCE(%s, false), %s::jsonb, %s::jsonb, %s::jsonb)
                RETURNING event_id, start_time, category, sport_type, name, workout_xml,
                          predicted_tss, predicted_distance_m, external_id, status, done,
                          plan_goal_id, plan_source, training_type, workout_prescription,
                          athlete_edited, linked_activity_id, completed_distance_m,
                          completed_duration_s, completed_avg_hr, completed_rpe,
                          actual_logged_at, execution, quality, session_classification
                """,
                (
                    event["event_id"],
                    athlete_id,
                    event["start_time"],
                    event["category"],
                    event.get("sport_type"),
                    event.get("name"),
                    event.get("workout_xml"),
                    event.get("predicted_tss"),
                    event.get("predicted_distance_m"),
                    event.get("status"),
                    event.get("done"),
                    event.get("plan_goal_id"),
                    event.get("plan_source"),
                    event.get("training_type"),
                    _jsonb(event.get("workout_prescription")),
                    event.get("athlete_edited"),
                    _jsonb(event.get("execution")),
                    _jsonb(event.get("quality")),
                    _jsonb(event.get("session_classification")),
                ),
            )
            row = await cur.fetchone()
        assert row is not None
        return row

    async def update(
        self, athlete_id: UUID, event_id: str, event: dict[str, object]
    ) -> dict[str, object] | None:
        edited = (
            "name" in event
            or "predicted_tss" in event
            or "predicted_distance_m" in event
            or "workout_prescription" in event
        )
        async with await _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE training_calendar SET
                    start_time = COALESCE(%s, start_time),
                    category = COALESCE(%s, category),
                    sport_type = COALESCE(%s, sport_type),
                    name = COALESCE(%s, name),
                    workout_xml = COALESCE(%s, workout_xml),
                    predicted_tss = COALESCE(%s, predicted_tss),
                    predicted_distance_m = COALESCE(%s, predicted_distance_m),
                    status = COALESCE(%s, status),
                    done = COALESCE(%s, done),
                    training_type = COALESCE(%s, training_type),
                    workout_prescription = COALESCE(%s::jsonb, workout_prescription),
                    completed_distance_m = COALESCE(%s, completed_distance_m),
                    completed_duration_s = COALESCE(%s, completed_duration_s),
                    completed_avg_hr = COALESCE(%s, completed_avg_hr),
                    completed_rpe = COALESCE(%s, completed_rpe),
                    actual_logged_at = COALESCE(%s, actual_logged_at),
                    linked_activity_id = COALESCE(%s, linked_activity_id),
                    execution = COALESCE(%s::jsonb, execution),
                    quality = COALESCE(%s::jsonb, quality),
                    session_classification = COALESCE(%s::jsonb, session_classification),
                    athlete_edited = CASE WHEN %s THEN true ELSE athlete_edited END,
                    plan_source = CASE WHEN %s THEN 'manual' ELSE plan_source END
                WHERE athlete_id = %s AND event_id = %s
                RETURNING event_id, start_time, category, sport_type, name, workout_xml,
                          predicted_tss, predicted_distance_m, external_id, status, done,
                          plan_goal_id, plan_source, training_type, workout_prescription,
                          athlete_edited, linked_activity_id, completed_distance_m,
                          completed_duration_s, completed_avg_hr, completed_rpe,
                          actual_logged_at, execution, quality, session_classification
                """,
                (
                    event.get("start_time"),
                    event.get("category"),
                    event.get("sport_type"),
                    event.get("name"),
                    event.get("workout_xml"),
                    event.get("predicted_tss"),
                    event.get("predicted_distance_m"),
                    event.get("status"),
                    event.get("done"),
                    event.get("training_type"),
                    _jsonb(event.get("workout_prescription")),
                    event.get("completed_distance_m"),
                    event.get("completed_duration_s"),
                    event.get("completed_avg_hr"),
                    event.get("completed_rpe"),
                    event.get("actual_logged_at"),
                    event.get("linked_activity_id"),
                    _jsonb(event.get("execution")),
                    _jsonb(event.get("quality")),
                    _jsonb(event.get("session_classification")),
                    edited,
                    edited,
                    athlete_id,
                    event_id,
                ),
            )
            return await cur.fetchone()

    async def delete(self, athlete_id: UUID, event_id: str) -> bool:
        async with await _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                "UPDATE training_calendar SET status = 'deleted' "
                "WHERE athlete_id = %s AND event_id = %s",
                (athlete_id, event_id),
            )
            return cur.rowcount > 0

    async def get_by_id(self, athlete_id: UUID, event_id: str) -> dict[str, object] | None:
        async with await _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT event_id, start_time, category, sport_type, name, workout_xml,
                       predicted_tss, predicted_distance_m, external_id, status, done,
                       plan_goal_id, plan_source, training_type, workout_prescription,
                       athlete_edited, linked_activity_id, completed_distance_m,
                       completed_duration_s, completed_avg_hr, completed_rpe,
                       actual_logged_at, execution, quality, session_classification
                FROM training_calendar
                WHERE athlete_id = %s AND event_id = %s AND status <> 'deleted'
                """,
                (athlete_id, event_id),
            )
            return await cur.fetchone()
