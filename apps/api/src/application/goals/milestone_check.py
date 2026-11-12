"""阶段里程碑的自动核验：阶段结束后按窗口内累计跑量判定达成。"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.goals.progress_queries import phase_distance_sum

_PENDING_SQL = """
SELECT m.milestone_id, m.target_value, p.start_date, p.end_date, g.sport_key
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
    """窗口累计距离达到里程碑目标值（按公里）时写达成。

    只处理已结束的阶段：进行中的阶段距离还没走完，核验没有意义。
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(_PENDING_SQL, (athlete_id, date.today()))
        rows = await cur.fetchall()
    for row in rows:
        target_km = _target_km(row.get("target_value"))
        if target_km is None:
            continue
        start = row.get("start_date")
        end = row.get("end_date")
        if not isinstance(start, date) or not isinstance(end, date):
            continue
        distance_m = await phase_distance_sum(
            conn, athlete_id, str(row.get("sport_key") or "run"), (start, end)
        )
        if distance_m / 1000.0 >= target_km:
            async with conn.cursor() as cur:
                _ = await cur.execute(_ACHIEVE_SQL, (row["milestone_id"],))


def _target_km(value: object) -> float | None:
    """里程碑目标值按公里解读；非数值不参与自动核验。"""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    target = float(value)
    return target if target > 0 else None
