"""比赛结案的读取与写入：候选活动匹配、成绩落库。"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from infrastructure.db.pool import ConnectionContext
from infrastructure.repositories.goals import _GOAL_FIELDS, _connect, _row

GoalList = list[dict[str, object]]

_RACE_CANDIDATES_SQL = """
SELECT a.activity_id, a.start_time, a.sport, a.name, a.distance_m, a.duration_s,
       a.is_race
FROM activity_compute a
JOIN athletes ath ON ath.id = a.athlete_id
WHERE a.athlete_id = %s
  AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
      BETWEEN %s - 1 AND %s + 1
  AND (
      a.is_race
      OR (%s IS NOT NULL AND a.distance_m IS NOT NULL
          AND a.distance_m BETWEEN %s * 0.9 AND %s * 1.1)
  )
  AND NOT EXISTS (
      SELECT 1 FROM goals g
      WHERE g.race_activity_id = a.activity_id AND g.goal_id <> %s
  )
ORDER BY a.start_time
"""

_SPORT_EXISTS_SQL = "SELECT 1 FROM sport_definitions WHERE sport_key = %s"

_RECORD_RESULT_SQL = f"""
UPDATE goals SET status = 'achieved', race_actual_time_s = %s,
race_activity_id = %s, updated_at = now()
WHERE athlete_id = %s AND goal_id = %s AND status <> 'abandoned'
RETURNING {_GOAL_FIELDS}
"""


class GoalRaceRepo:
    """比赛目标的生命周期收尾：验证、候选、结案。"""

    async def sport_exists(self, sport_key: str) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(_SPORT_EXISTS_SQL, (sport_key,))
            return await cur.fetchone() is not None

    async def race_candidates(
        self, athlete_id: UUID, goal_id: UUID, race_day: date, race_distance_m: float | None
    ) -> GoalList:
        """比赛日 ±1 天内可结案的活动：标了比赛，或距离落在目标 ±10%。"""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _RACE_CANDIDATES_SQL,
                (
                    athlete_id,
                    race_day,
                    race_day,
                    race_distance_m,
                    race_distance_m,
                    race_distance_m,
                    goal_id,
                ),
            )
            rows = await cur.fetchall()
        return [_row(row) for row in rows]

    async def record_race_result(
        self,
        athlete_id: UUID,
        goal_id: UUID,
        finish_time_s: int | None,
        activity_id: str | None,
    ) -> dict[str, object] | None:
        """写入实际完赛成绩并结案目标。"""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _RECORD_RESULT_SQL, (finish_time_s, activity_id, athlete_id, goal_id)
            )
            row = await cur.fetchone()
        return _row(row) if row else None


def race_repo_connect() -> ConnectionContext:
    """暴露连接上下文给需要同库协作的调用方。"""
    return _connect()
