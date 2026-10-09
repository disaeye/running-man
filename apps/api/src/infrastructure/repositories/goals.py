from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool

GoalList = list[dict[str, object]]


def _connect() -> ConnectionContext:
    return cast(ConnectionContext, get_pool().connection())


def _row(row: object) -> dict[str, object]:
    values = dict(cast(Mapping[str, object], row))
    return {key: _json_scalar(value) for key, value in values.items()}


def _json_scalar(value: object) -> object:
    if isinstance(value, bytes):
        return value.decode()
    if isinstance(value, UUID):
        return str(value)
    return value


_GOAL_FIELDS = """
goal_id, athlete_id, type::text AS type, title, target_value, current_value, unit::text AS unit,
target_date, race_distance_m, race_target_time_s, status::text AS status, created_at, updated_at
"""
_MILESTONE_FIELDS = """
milestone_id, goal_id, title, target_date, target_value, achieved, achieved_at
"""
_PHASE_FIELDS = """
phase_id, goal_id, name, start_date, end_date, target_weekly_tss
"""


class GoalsRepo:
    async def list(self, athlete_id: UUID) -> list[dict[str, object]]:
        query = f"""
        SELECT {_GOAL_FIELDS} FROM goals
        WHERE athlete_id = %s AND status <> 'abandoned'
        ORDER BY target_date NULLS LAST, created_at DESC
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def create(self, athlete_id: UUID, data: dict[str, object]) -> dict[str, object]:
        query = f"""
        INSERT INTO goals
        (athlete_id, type, title, target_value, current_value, unit, target_date,
         race_distance_m, race_target_time_s, status)
        VALUES (%s, %s, %s, %s, COALESCE(%s, 0), %s, %s, %s, %s, COALESCE(%s, 'active'))
        RETURNING {_GOAL_FIELDS}
        """
        values = (
            athlete_id,
            data["type"],
            data["title"],
            data.get("target_value"),
            data.get("current_value"),
            data.get("unit"),
            data.get("target_date"),
            data.get("race_distance_m"),
            data.get("race_target_time_s"),
            data.get("status"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def get(self, athlete_id: UUID, goal_id: UUID) -> dict[str, object] | None:
        query = f"""
        SELECT {_GOAL_FIELDS} FROM goals
        WHERE athlete_id = %s AND goal_id = %s AND status <> 'abandoned'
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, goal_id))
            row = await cur.fetchone()
            return _row(row) if row else None

    async def update(
        self, athlete_id: UUID, goal_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE goals SET type = COALESCE(%s::varchar, type), title = COALESCE(%s::text, title),
        target_value = COALESCE(%s::double precision, target_value),
        current_value = COALESCE(%s::double precision, current_value),
        unit = COALESCE(%s::varchar, unit),
        target_date = CASE WHEN %s::boolean THEN %s::date ELSE target_date END,
        race_distance_m = CASE WHEN %s::boolean THEN %s::double precision ELSE race_distance_m END,
        race_target_time_s = CASE WHEN %s::boolean THEN %s::integer ELSE race_target_time_s END,
        status = COALESCE(%s::varchar, status), updated_at = now()
        WHERE athlete_id = %s AND goal_id = %s RETURNING {_GOAL_FIELDS}
        """
        values = (
            data.get("type"),
            data.get("title"),
            data.get("target_value"),
            data.get("current_value"),
            data.get("unit"),
            "target_date" in data,
            data.get("target_date"),
            "race_distance_m" in data or data.get("type") not in (None, "event"),
            data.get("race_distance_m") if data.get("type") in (None, "event") else None,
            "race_target_time_s" in data
            or data.get("type") not in (None, "event")
            or ("race_distance_m" in data and data.get("race_distance_m") is None),
            data.get("race_target_time_s") if data.get("type") in (None, "event") else None,
            data.get("status"),
            athlete_id,
            goal_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def update_current_value(
        self, athlete_id: UUID, goal_id: UUID, current_value: float, status: str | None = None
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE goals SET current_value = %s, status = COALESCE(%s::varchar, status),
        updated_at = now()
        WHERE athlete_id = %s AND goal_id = %s RETURNING {_GOAL_FIELDS}
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (current_value, status, athlete_id, goal_id))
            row = await cur.fetchone()
            return _row(row) if row else None

    async def delete(self, athlete_id: UUID, goal_id: UUID) -> bool:
        query = """
        UPDATE goals SET status = 'abandoned', updated_at = now()
        WHERE athlete_id = %s AND goal_id = %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, goal_id))
            return cur.rowcount > 0

    async def list_milestones(self, goal_id: UUID) -> GoalList:
        query = f"""
        SELECT {_MILESTONE_FIELDS} FROM milestones
        WHERE goal_id = %s ORDER BY target_date NULLS LAST
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (goal_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def create_milestone(self, goal_id: UUID, data: dict[str, object]) -> dict[str, object]:
        query = f"""
        INSERT INTO milestones (goal_id, title, target_date, target_value, achieved, achieved_at)
        VALUES (%s, %s, %s, %s, COALESCE(%s, false), %s) RETURNING {_MILESTONE_FIELDS}
        """
        values = (
            goal_id,
            data["title"],
            data.get("target_date"),
            data.get("target_value"),
            data.get("achieved"),
            data.get("achieved_at"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def update_milestone(
        self, goal_id: UUID, milestone_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE milestones SET title = COALESCE(%s::text, title),
        target_date = COALESCE(%s::date, target_date),
        target_value = COALESCE(%s::double precision, target_value),
        achieved = COALESCE(%s::boolean, achieved),
        achieved_at = COALESCE(%s::timestamptz, achieved_at)
        WHERE goal_id = %s AND milestone_id = %s RETURNING {_MILESTONE_FIELDS}
        """
        values = (
            data.get("title"),
            data.get("target_date"),
            data.get("target_value"),
            data.get("achieved"),
            data.get("achieved_at"),
            goal_id,
            milestone_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def list_training_phases(
        self, athlete_id: UUID, goal_id: UUID
    ) -> GoalList:
        query = f"""
        SELECT {_PHASE_FIELDS} FROM training_phases
        WHERE athlete_id = %s AND goal_id = %s ORDER BY start_date
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, goal_id))
            return [_row(row) for row in await cur.fetchall()]

    async def create_training_phase(
        self, athlete_id: UUID, goal_id: UUID, data: dict[str, object]
    ) -> dict[str, object]:
        query = f"""
        INSERT INTO training_phases (
            athlete_id, goal_id, name, start_date, end_date, target_weekly_tss
        ) VALUES (%s, %s, %s, %s, %s, %s) RETURNING {_PHASE_FIELDS}
        """
        values = (
            athlete_id,
            goal_id,
            data["name"],
            data["start_date"],
            data["end_date"],
            data.get("target_weekly_tss"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)
