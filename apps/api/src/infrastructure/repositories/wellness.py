from __future__ import annotations

from datetime import date
from uuid import UUID

import psycopg

from infrastructure.db.pool import ConnectionContext, get_pool


def last_wellness_day(conn: psycopg.Connection, athlete_id: int | str) -> date | None:
    """Newest stored wellness day, so an incremental refresh starts from it."""
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT max(day) FROM health_wellness WHERE athlete_id = %s",
            (athlete_id,),
        )
        row = cur.fetchone()
    return row[0] if row and row[0] is not None else None


def _connect() -> ConnectionContext:
    return get_pool().connection()


class WellnessRepo:
    async def list_range(self, athlete_id: UUID, start: date, end: date) -> list[dict[str, object]]:
        query = """
        SELECT day, resting_hr, weight, sleep_secs, sleep_score, fatigue, soreness, hrv,
               vo2max, steps, stress, mood, motivation, readiness AS source_readiness, comments
        FROM health_wellness WHERE athlete_id = %s AND day BETWEEN %s AND %s ORDER BY day
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def readiness_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        query = """
        SELECT day, resting_hr, sleep_secs, sleep_score, fatigue, soreness, hrv, readiness
        FROM health_wellness WHERE athlete_id = %s AND day BETWEEN %s AND %s ORDER BY day
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def sleep_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        query = """
        SELECT day, sleep_secs, sleep_score FROM health_wellness
        WHERE athlete_id = %s AND day BETWEEN %s AND %s ORDER BY day
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]
