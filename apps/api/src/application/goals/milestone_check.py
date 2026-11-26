"""阶段里程碑的自动核验：阶段结束后按窗口内累计跑量判定达成。"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.goals.progress_queries import phase_distance_sum
from domain.time import today_in_zone

_PENDING_SQL = """
SELECT m.milestone_id, m.target_value,
       COALESCE(m.unit, g.unit::text) AS unit,
       p.start_date, p.end_date, g.sport_key
FROM milestones m
JOIN training_phases p ON p.phase_id = m.phase_id
JOIN goals g ON g.goal_id = m.goal_id
WHERE g.athlete_id = %s
  AND m.achieved = false
  AND m.phase_id IS NOT NULL
  AND m.target_value IS NOT NULL
  AND p.end_date < %s
"""

_ACHIEVE_SQL = """
UPDATE milestones SET achieved = true, achieved_at = now()
WHERE milestone_id = %s AND achieved = false
"""


async def check_phase_milestones(conn: AsyncConnection[DictRow], athlete_id: UUID) -> None:
    """窗口累计距离达到里程碑目标值时写达成（按目标单位换算 m/km）。

    只处理已结束的阶段：进行中的阶段距离还没走完，核验没有意义。
    """
    async with conn.cursor() as cur:
        _ = await cur.execute("SELECT timezone FROM athletes WHERE id = %s", (athlete_id,))
        tz_row = await cur.fetchone()
        raw_tz = tz_row.get("timezone") if tz_row else None
        tz = (
            raw_tz.decode()
            if isinstance(raw_tz, bytes | bytearray)
            else (str(raw_tz) if raw_tz else None)
        )
        _ = await cur.execute(_PENDING_SQL, (athlete_id, today_in_zone(tz)))
        rows = await cur.fetchall()
    for row in rows:
        target = _target_value(row.get("target_value"))
        if target is None:
            continue
        unit = str(row.get("unit") or "km").strip().lower()
        target_m = target if unit in {"m", "米"} else target * 1000.0
        start = row.get("start_date")
        end = row.get("end_date")
        if not isinstance(start, date) or not isinstance(end, date):
            continue
        distance_m = await phase_distance_sum(
            conn, athlete_id, str(row.get("sport_key") or "run"), (start, end)
        )
        if distance_m >= target_m:
            async with conn.cursor() as cur:
                _ = await cur.execute(_ACHIEVE_SQL, (row["milestone_id"],))


def _target_value(value: object) -> float | None:
    """里程碑目标值；非数值不参与自动核验。"""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    target = float(value)
    return target if target > 0 else None
