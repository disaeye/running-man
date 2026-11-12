"""目标进度的 SQL 读取：按类型聚合活动与健康记录。

语句全部是字面 SQL：所有值都走参数绑定，不拼接。
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

_ACCUMULATE_SQL = """
SELECT COALESCE(SUM(a.distance_m), 0) AS raw_value
FROM activity_compute a
JOIN athletes ath ON ath.id = a.athlete_id
JOIN sport_definitions goal_sport ON goal_sport.sport_key = %(sport_key)s
JOIN sport_definitions act_sport ON act_sport.sport_key = a.sport
WHERE a.athlete_id = %(athlete_id)s
  AND act_sport.family = goal_sport.family
  AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
      BETWEEN %(start)s AND %(end)s
"""

_DURATION_SQL = """
SELECT COALESCE(SUM(a.duration_s), 0) AS raw_value
FROM activity_compute a
JOIN athletes ath ON ath.id = a.athlete_id
JOIN sport_definitions goal_sport ON goal_sport.sport_key = %(sport_key)s
JOIN sport_definitions act_sport ON act_sport.sport_key = a.sport
WHERE a.athlete_id = %(athlete_id)s
  AND act_sport.family = goal_sport.family
  AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
      BETWEEN %(start)s AND %(end)s
"""

_CONSISTENCY_SQL = """
SELECT COUNT(DISTINCT (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date)
       AS raw_value
FROM activity_compute a
JOIN athletes ath ON ath.id = a.athlete_id
JOIN sport_definitions goal_sport ON goal_sport.sport_key = %(sport_key)s
JOIN sport_definitions act_sport ON act_sport.sport_key = a.sport
WHERE a.athlete_id = %(athlete_id)s
  AND act_sport.family = goal_sport.family
  AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
      BETWEEN %(start)s AND %(end)s
"""

_LATEST_WEIGHT_SQL = """
SELECT weight AS raw_value
FROM health_wellness
WHERE athlete_id = %(athlete_id)s
  AND weight IS NOT NULL
  AND day BETWEEN %(start)s AND %(end)s
ORDER BY day DESC
LIMIT 1
"""

_PHASE_DISTANCE_SQL = """
SELECT COALESCE(SUM(a.distance_m), 0) AS raw_value
FROM activity_compute a
JOIN athletes ath ON ath.id = a.athlete_id
JOIN sport_definitions goal_sport ON goal_sport.sport_key = %s
JOIN sport_definitions act_sport ON act_sport.sport_key = a.sport
WHERE a.athlete_id = %s
  AND act_sport.family = goal_sport.family
  AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
      BETWEEN %s AND %s
"""


async def accumulated_distance(conn: AsyncConnection[DictRow], params: dict[str, object]) -> float:
    async with conn.cursor() as cur:
        _ = await cur.execute(_ACCUMULATE_SQL, params)
        row = await cur.fetchone()
    return _number(row)


async def accumulated_duration(conn: AsyncConnection[DictRow], params: dict[str, object]) -> float:
    async with conn.cursor() as cur:
        _ = await cur.execute(_DURATION_SQL, params)
        row = await cur.fetchone()
    return _number(row)


async def distinct_training_days(
    conn: AsyncConnection[DictRow], params: dict[str, object]
) -> float:
    async with conn.cursor() as cur:
        _ = await cur.execute(_CONSISTENCY_SQL, params)
        row = await cur.fetchone()
    return _number(row)


async def latest_weight(conn: AsyncConnection[DictRow], params: dict[str, object]) -> float | None:
    """窗口内最近一条体重记录；没有记录时返回 None，保持 current_value 不动。"""
    async with conn.cursor() as cur:
        _ = await cur.execute(_LATEST_WEIGHT_SQL, params)
        row = await cur.fetchone()
    if row is None:
        return None
    value = row.get("raw_value")
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return None


def _number(row: DictRow | None) -> float:
    if row is None:
        return 0.0
    value = row.get("raw_value")
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return 0.0


async def phase_distance_sum(
    conn: AsyncConnection[DictRow], athlete_id: UUID, sport_key: str, window: tuple[date, date]
) -> float:
    """阶段窗口内同运动族的累计距离（米），供里程碑自动核验。"""
    async with conn.cursor() as cur:
        _ = await cur.execute(_PHASE_DISTANCE_SQL, (sport_key, athlete_id, window[0], window[1]))
        row = await cur.fetchone()
    return _number(row)
