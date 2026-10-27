from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


class RaceResultRepo:
    async def list_for_athlete(self, athlete_id: UUID) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                SELECT id, athlete_id, event_name, distance_category, time_s, race_date,
                       a1_certified, activity_id, created_at
                FROM race_results
                WHERE athlete_id = %s
                ORDER BY race_date DESC, created_at DESC
                """,
                (athlete_id,),
            )
            return [_row(row) for row in await cur.fetchall()]

    async def latest_for_athlete(self, athlete_id: UUID) -> dict[str, object] | None:
        """最近一场比赛；没有成绩时返回 None，由调用方显示「未录入」。"""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                SELECT id, athlete_id, event_name, distance_category, time_s, race_date,
                       a1_certified, activity_id, created_at
                FROM race_results
                WHERE athlete_id = %s
                ORDER BY race_date DESC, created_at DESC
                LIMIT 1
                """,
                (athlete_id,),
            )
            row = await cur.fetchone()
            return _row(row) if row else None

    async def create(
        self,
        athlete_id: UUID,
        event_name: str,
        distance_category: str,
        time_s: int,
        race_date: date,
        a1_certified: bool,
        activity_id: str | None,
    ) -> dict[str, object]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                INSERT INTO race_results
                (athlete_id, event_name, distance_category, time_s, race_date, a1_certified,
                 activity_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, athlete_id, event_name, distance_category, time_s, race_date,
                          a1_certified, activity_id, created_at
                """,
                (
                    athlete_id,
                    event_name,
                    distance_category,
                    time_s,
                    race_date,
                    a1_certified,
                    activity_id,
                ),
            )
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def delete(self, athlete_id: UUID, result_id: UUID) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM race_results WHERE id = %s AND athlete_id = %s",
                (result_id, athlete_id),
            )
            return cur.rowcount > 0
