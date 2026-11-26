"""按目标类型计算进度并驱动达成判定（含阶段里程碑核验）。

距离与时长按目标的 unit 换算后累计；坚持按本地训练日去重计数；体重读
窗口内最近一条记录。比赛目标不自动累计（达成由比赛结案写入）。
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import cast
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.goals.milestone_check import check_phase_milestones
from application.goals.progress_queries import (
    accumulated_distance,
    accumulated_duration,
    distinct_training_days,
    latest_weight,
)
from infrastructure.db.pool import get_pool, open_pool

# 比赛目标没有可累计的量：达成由「记录比赛结果」写入。
MANUAL_GOAL_TYPES = {"event"}

# 单位换算：原始聚合值（米 / 秒）除以系数得到目标单位。
_DISTANCE_DIVISORS = {"km": 1000.0, "m": 1.0}
_DURATION_DIVISORS = {"min": 60.0, "h": 3600.0, "s": 1.0}

_GOAL_FIELDS = """
goal_id, athlete_id, type::text AS type, title, target_value, current_value, unit::text AS unit,
direction::text AS direction, start_date, sport_key, is_primary, baseline_value,
target_date, race_distance_m, race_target_time_s, race_actual_time_s, race_activity_id,
status::text AS status, g.created_at, g.updated_at,
(g.created_at AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS created_day,
(now() AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS local_today
"""


def _row(row: object) -> dict[str, object]:
    values = dict(cast(Mapping[str, object], row))
    return {
        key: value.decode() if isinstance(value, bytes) else value for key, value in values.items()
    }


def _window(goal: dict[str, object]) -> tuple[date, date]:
    """统计窗口：起算日（缺省创建日）到目标日（缺省今天）。"""
    start = goal.get("start_date")
    if not isinstance(start, date):
        start = cast(date, goal["created_day"])
    end = goal.get("target_date")
    if not isinstance(end, date):
        end = cast(date, goal["local_today"])
    return start, end


async def refresh_goal_progress(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object]:
    goal = await _get_goal(athlete_id, goal_id, db_conn)
    if goal is None:
        raise ValueError("goal not found")

    goal_type = str(goal["type"])
    if goal_type in MANUAL_GOAL_TYPES:
        return goal

    current_value = await _current_value(athlete_id, goal, db_conn)
    if current_value is None:
        return goal
    status = _refreshed_status(goal, current_value)
    updated = await _update_goal(athlete_id, goal_id, current_value, status, db_conn)
    if updated is None:
        raise ValueError("goal not found")
    return updated


async def refresh_active_goal_progress(athlete_id: UUID) -> None:
    """活动或健康数据变化后刷新该运动员全部 active 目标与阶段里程碑。"""
    await open_pool()
    async with get_pool().connection() as conn:
        async with conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT goal_id FROM goals WHERE athlete_id = %s AND status = 'active'",
                (athlete_id,),
            )
            rows = await cur.fetchall()
        for row in rows:
            await refresh_goal_progress(athlete_id, cast(UUID, row["goal_id"]), conn)
        await check_phase_milestones(conn, athlete_id)


async def _get_goal(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object] | None:
    query = f"""
    SELECT {_GOAL_FIELDS} FROM goals g
    JOIN athletes ath ON ath.id = g.athlete_id
    WHERE g.athlete_id = %s AND g.goal_id = %s AND g.status <> 'abandoned'
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, goal_id))
        row = await cur.fetchone()
    return _row(row) if row else None


async def _current_value(
    athlete_id: UUID, goal: dict[str, object], db_conn: AsyncConnection[DictRow]
) -> float | None:
    goal_type = str(goal["type"])
    start, end = _window(goal)
    params: dict[str, object] = {
        "athlete_id": athlete_id,
        "sport_key": goal.get("sport_key") or "run",
        "start": start,
        "end": end,
    }
    if goal_type == "distance":
        raw = await accumulated_distance(db_conn, params)
        return raw / _divisor(_DISTANCE_DIVISORS, goal.get("unit"), "km")
    if goal_type == "time":
        raw = await accumulated_duration(db_conn, params)
        return raw / _divisor(_DURATION_DIVISORS, goal.get("unit"), "min")
    if goal_type == "consistency":
        return await distinct_training_days(db_conn, params)
    if goal_type == "weight":
        return await latest_weight(db_conn, params)
    return None


def _divisor(table: dict[str, float], unit: object, default: str) -> float:
    key = str(unit).strip().lower() if isinstance(unit, str) else default
    return table.get(key, table[default])


def _refreshed_status(goal: dict[str, object], current_value: float) -> str | None:
    """方向感知的达成判定；未达成返回 None，保持原状态。"""
    target_value = cast(float | int | None, goal.get("target_value"))
    if target_value is None:
        return None
    target = float(target_value)
    if str(goal.get("direction")) == "decrease":
        return "achieved" if current_value <= target else None
    return "achieved" if current_value >= target else None


async def _update_goal(
    athlete_id: UUID,
    goal_id: UUID,
    current_value: float,
    status: str | None,
    db_conn: AsyncConnection[DictRow],
) -> dict[str, object] | None:
    query = """
    UPDATE goals SET current_value = %s, status = COALESCE(%s::varchar, status),
    updated_at = now()
    WHERE athlete_id = %s AND goal_id = %s
    RETURNING goal_id, athlete_id, type::text AS type, title, target_value,
              current_value, unit::text AS unit, direction::text AS direction,
              start_date, sport_key, is_primary, baseline_value, target_date,
              race_distance_m, race_target_time_s, race_actual_time_s,
              race_activity_id, status::text AS status, created_at, updated_at
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (current_value, status, athlete_id, goal_id))
        row = await cur.fetchone()
    return _row(row) if row else None
