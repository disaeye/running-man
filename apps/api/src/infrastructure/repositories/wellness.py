from __future__ import annotations

from datetime import date
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


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
