from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from psycopg import AsyncCursor
from psycopg.rows import DictRow

from infrastructure.db.pool import ConnectionContext, get_pool

GoalList = list[dict[str, object]]


def _connect() -> ConnectionContext:
    return cast(ConnectionContext, get_pool().connection())


async def _demote_other_primarys(
    cur: AsyncCursor[DictRow], athlete_id: UUID, except_goal_id: UUID | None
) -> None:
    """同一次事务内把其他 active 主目标降级，保证唯一索引不被违反。"""
    _ = await cur.execute(
        "UPDATE goals SET is_primary = false, updated_at = now() "
        "WHERE athlete_id = %s AND is_primary AND status = 'active' "
        "AND goal_id IS DISTINCT FROM %s",
        (athlete_id, except_goal_id),
    )


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
direction::text AS direction, start_date, sport_key, is_primary, baseline_value,
target_date, race_distance_m, race_target_time_s, race_actual_time_s, race_activity_id,
status::text AS status, created_at, updated_at
"""
_MILESTONE_FIELDS = """
milestone_id, goal_id, phase_id, title, target_date, target_value, unit, result_text,
achieved, achieved_at
"""
_PHASE_FIELDS = """
phase_id, goal_id, name, start_date, end_date, target_weekly_tss, target_weekly_distance_m
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
        direction = data.get("direction") or (
            "decrease" if data["type"] == "weight" else "increase"
        )
        query = f"""
        INSERT INTO goals
        (athlete_id, type, title, target_value, current_value, unit, direction, start_date,
         sport_key, is_primary, baseline_value, target_date,
         race_distance_m, race_target_time_s, status)
        VALUES (%s, %s, %s, %s, COALESCE(%s, 0), %s, %s::varchar,
                COALESCE(%s::date, now()::date), COALESCE(%s::varchar, 'run'),
                COALESCE(%s::boolean, false), %s, %s, %s, %s,
                COALESCE(%s::varchar, 'active'))
        RETURNING {_GOAL_FIELDS}
        """
        values = (
            athlete_id,
            data["type"],
            data["title"],
            data.get("target_value"),
            data.get("current_value"),
            data.get("unit"),
            direction,
            data.get("start_date"),
            data.get("sport_key"),
            data.get("is_primary"),
            data.get("baseline_value"),
            data.get("target_date"),
            data.get("race_distance_m"),
            data.get("race_target_time_s"),
            data.get("status"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            if data.get("is_primary"):
                await _demote_other_primarys(cur, athlete_id, None)
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
        direction = COALESCE(%s::varchar, direction),
        start_date = CASE WHEN %s::boolean THEN %s::date ELSE start_date END,
        sport_key = CASE WHEN %s::boolean THEN %s::varchar ELSE sport_key END,
        is_primary = COALESCE(%s::boolean, is_primary),
        baseline_value = CASE WHEN %s::boolean THEN %s::double precision
                              ELSE baseline_value END,
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
            data.get("direction"),
            "start_date" in data,
            data.get("start_date"),
            "sport_key" in data,
            data.get("sport_key"),
            data.get("is_primary"),
            "baseline_value" in data,
            data.get("baseline_value"),
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
            if data.get("is_primary"):
                await _demote_other_primarys(cur, athlete_id, goal_id)
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
