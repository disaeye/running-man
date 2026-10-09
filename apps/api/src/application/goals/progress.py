from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

_MANUAL_GOAL_TYPES = {"event", "weight"}
_PROGRESS_COLUMNS = {
    "distance": "SUM(distance_m)",
    "time": "SUM(duration_s)",
    "consistency": "COUNT(DISTINCT start_time::date)",
}
_GOAL_FIELDS = """
goal_id, athlete_id, type::text AS type, title, target_value, current_value, unit::text AS unit,
target_date, status::text AS status, created_at, updated_at
"""


def _row(row: object) -> dict[str, object]:
    values = dict(cast(Mapping[str, object], row))
    return {
        key: value.decode() if isinstance(value, bytes) else value for key, value in values.items()
    }


async def refresh_goal_progress(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object]:
    goal = await _get_goal(athlete_id, goal_id, db_conn)
    if goal is None:
        raise ValueError("goal not found")

    goal_type = str(goal["type"])
    if goal_type in _MANUAL_GOAL_TYPES:
        return goal

    current_value = await _current_value(athlete_id, goal, db_conn)
    status = _refreshed_status(goal, current_value)
    updated = await _update_goal(athlete_id, goal_id, current_value, status, db_conn)
    if updated is None:
        raise ValueError("goal not found")
    return updated


async def _get_goal(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object] | None:
    query = f"""
    SELECT {_GOAL_FIELDS} FROM goals
    WHERE athlete_id = %s AND goal_id = %s AND status <> 'abandoned'
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, goal_id))
        row = await cur.fetchone()
    return _row(row) if row else None


async def _current_value(
    athlete_id: UUID, goal: dict[str, object], db_conn: AsyncConnection[DictRow]
) -> float:
    goal_type = str(goal["type"])
    progress_column = _PROGRESS_COLUMNS.get(goal_type)
    if progress_column is None:
        return float(cast(float | int | None, goal.get("current_value")) or 0.0)

    query = f"""
    SELECT COALESCE({progress_column}, 0) AS current_value
    FROM activity_compute a
    JOIN athletes ath ON ath.id = a.athlete_id
    WHERE a.athlete_id = %s
      AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
          BETWEEN %s::date AND %s::date
    """
    async with db_conn.cursor() as cur:
        await cur.execute(query, (athlete_id, goal["created_at"], goal["target_date"]))
        row = await cur.fetchone()
    if not row:
        return 0.0
    value = cast(Mapping[str, object], row)["current_value"]
    return float(cast(float | int | None, value) or 0.0)


def _refreshed_status(goal: dict[str, object], current_value: float) -> str | None:
    target_value = cast(float | int | None, goal.get("target_value"))
    if target_value is not None and current_value >= float(target_value):
        return "achieved"
    return None


async def _update_goal(
    athlete_id: UUID,
    goal_id: UUID,
    current_value: float,
    status: str | None,
    db_conn: AsyncConnection[DictRow],
) -> dict[str, object] | None:
    query = f"""
    UPDATE goals SET current_value = %s, status = COALESCE(%s::varchar, status),
    updated_at = now()
    WHERE athlete_id = %s AND goal_id = %s RETURNING {_GOAL_FIELDS}
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (current_value, status, athlete_id, goal_id))
        row = await cur.fetchone()
    return _row(row) if row else None
