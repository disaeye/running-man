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


class CalendarRepo:
    async def list(
        self, athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        query = """
        SELECT event_id, start_time, category, sport_type, name, workout_xml, predicted_tss,
               external_id, status, done, plan_goal_id, plan_source, training_type,
               workout_prescription, athlete_edited, linked_activity_id,
               completed_distance_m, completed_duration_s, completed_avg_hr,
               completed_rpe, actual_logged_at
        FROM training_calendar
        WHERE athlete_id = %s AND start_time BETWEEN %s AND %s AND status <> 'deleted'
        ORDER BY start_time
        """
        async with await _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, start, end))
            return list(await cur.fetchall())

    async def create(self, athlete_id: UUID, event: dict[str, object]) -> dict[str, object]:
        query = """
        INSERT INTO training_calendar
        (event_id, athlete_id, start_time, category, sport_type, name, workout_xml, predicted_tss,
         status, done, plan_goal_id, plan_source, training_type, workout_prescription, athlete_edited)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, COALESCE(%s, 'planned'), COALESCE(%s, false),
                %s, %s, %s, %s::jsonb, COALESCE(%s, false))
        RETURNING event_id, start_time, category, sport_type, name, workout_xml, predicted_tss,
                  status, done, plan_goal_id, plan_source, training_type, workout_prescription,
                  athlete_edited, linked_activity_id, completed_distance_m, completed_duration_s,
                  completed_avg_hr, completed_rpe, actual_logged_at
        """
        values = (
            event["event_id"],
            athlete_id,
            event["start_time"],
            event["category"],
            event.get("sport_type"),
            event.get("name"),
            event.get("workout_xml"),
            event.get("predicted_tss"),
            event.get("status"),
            event.get("done"),
            event.get("plan_goal_id"),
            event.get("plan_source"),
            event.get("training_type"),
            json.dumps(event["workout_prescription"], ensure_ascii=True)
            if event.get("workout_prescription") is not None
            else None,
            event.get("athlete_edited"),
        )
        async with await _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return row

    async def update(
        self, athlete_id: UUID, event_id: str, event: dict[str, object]
    ) -> dict[str, object] | None:
        query = """
        UPDATE training_calendar SET
            start_time = COALESCE(%s, start_time), category = COALESCE(%s, category),
            sport_type = COALESCE(%s, sport_type), name = COALESCE(%s, name),
            workout_xml = COALESCE(%s, workout_xml), predicted_tss = COALESCE(%s, predicted_tss),
            status = COALESCE(%s, status), done = COALESCE(%s, done),
            workout_prescription = COALESCE(%s::jsonb, workout_prescription),
            completed_distance_m = COALESCE(%s, completed_distance_m),
            completed_duration_s = COALESCE(%s, completed_duration_s),
            completed_avg_hr = COALESCE(%s, completed_avg_hr),
            completed_rpe = COALESCE(%s, completed_rpe),
            actual_logged_at = COALESCE(%s, actual_logged_at),
            linked_activity_id = COALESCE(%s, linked_activity_id),
            athlete_edited = CASE WHEN %s THEN true ELSE athlete_edited END,
            plan_source = CASE WHEN %s THEN 'manual' ELSE plan_source END
        WHERE athlete_id = %s AND event_id = %s
        RETURNING event_id, start_time, category, sport_type, name, workout_xml, predicted_tss,
                  status, done, plan_goal_id, plan_source, training_type, workout_prescription,
                  athlete_edited, linked_activity_id, completed_distance_m, completed_duration_s,
                  completed_avg_hr, completed_rpe, actual_logged_at
        """
        values = (
            event.get("start_time"),
            event.get("category"),
            event.get("sport_type"),
            event.get("name"),
            event.get("workout_xml"),
            event.get("predicted_tss"),
            event.get("status"),
            event.get("done"),
            json.dumps(event["workout_prescription"], ensure_ascii=True)
            if event.get("workout_prescription") is not None
            else None,
            event.get("completed_distance_m"),
            event.get("completed_duration_s"),
            event.get("completed_avg_hr"),
            event.get("completed_rpe"),
            event.get("actual_logged_at"),
            event.get("linked_activity_id"),
            "name" in event or "predicted_tss" in event or "workout_prescription" in event,
            "name" in event or "predicted_tss" in event or "workout_prescription" in event,
            athlete_id,
            event_id,
        )
        async with await _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            return await cur.fetchone()

    async def delete(self, athlete_id: UUID, event_id: str) -> bool:
        query = "UPDATE training_calendar SET status = 'deleted' WHERE athlete_id = %s AND event_id = %s"
        async with await _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, event_id))
            return cur.rowcount > 0

    async def get_by_id(self, athlete_id: UUID, event_id: str) -> dict[str, object] | None:
        query = """
        SELECT event_id, start_time, category, sport_type, name, workout_xml, predicted_tss,
               external_id, status, done, plan_goal_id, plan_source, training_type,
               workout_prescription, athlete_edited, linked_activity_id,
               completed_distance_m, completed_duration_s, completed_avg_hr,
               completed_rpe, actual_logged_at
        FROM training_calendar
        WHERE athlete_id = %s AND event_id = %s AND status <> 'deleted'
        """
        async with await _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, event_id))
            return await cur.fetchone()
