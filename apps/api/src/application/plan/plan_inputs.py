from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow


@dataclass(frozen=True)
class AthleteSettings:
    timezone: str
    weekly_training_days: int
    max_session_duration_min: int


async def athlete_settings(athlete_id: UUID, db_conn: AsyncConnection[DictRow]) -> AthleteSettings:
    async with db_conn.cursor() as cur:
        _ = await cur.execute(
            "SELECT timezone, weekly_training_days, max_session_duration_min "
            "FROM athletes WHERE id = %s",
            (athlete_id,),
        )
        row = await cur.fetchone()
    if row is None:
        raise ValueError("找不到运动员资料")
    return AthleteSettings(
        timezone=str(row["timezone"] or "UTC"),
        weekly_training_days=int(row["weekly_training_days"] or 5),
        max_session_duration_min=int(row["max_session_duration_min"] or 120),
    )


MIN_COMPLETE_RUN_WEEKS = 2
HISTORY_WEEKS = 6


async def recent_weekly_run_distance(
    athlete_id: UUID,
    today: date,
    db_conn: AsyncConnection[DictRow],
) -> tuple[float, int]:
    """返回近期平均实际跑步距离和有记录的周数。

    基线取活跃周（有有效跑步记录的周）的平均值：六周里只练了两周时，
    拿六周平均会把基线压到真实水平的三分之一，后续阶梯全部失真。
    """
    """返回近期完整本地周的平均实际跑步距离和有记录的周数。"""
    current_monday = today - timedelta(days=today.weekday())
    first_monday = current_monday - timedelta(weeks=HISTORY_WEEKS)
    query = """
    SELECT (a.start_time AT TIME ZONE athlete.timezone)::date AS local_day,
           SUM(a.distance_m) AS distance_m
    FROM activity_compute a
    JOIN athletes athlete ON athlete.id = a.athlete_id
    WHERE a.athlete_id = %s AND a.is_race = false AND a.distance_m > 0
      AND translate(lower(a.sport), '_- ', '') IN (
          'run', 'trailrun', 'virtualrun', 'treadmillrun', 'indoorrun'
      )
      AND (a.start_time AT TIME ZONE athlete.timezone)::date >= %s
      AND (a.start_time AT TIME ZONE athlete.timezone)::date < %s
    GROUP BY local_day
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, first_monday, current_monday))
        rows = await cur.fetchall()

    weekly_totals = [0.0] * HISTORY_WEEKS
    for row in rows:
        local_day = row["local_day"]
        distance = row["distance_m"]
        if not isinstance(local_day, date) or not isinstance(distance, int | float):
            continue
        week_index = (local_day - first_monday).days // 7
        if 0 <= week_index < HISTORY_WEEKS:
            weekly_totals[week_index] += float(distance)

    active_totals = [distance for distance in weekly_totals if distance > 0]
    active_weeks = len(active_totals)
    if active_weeks < MIN_COMPLETE_RUN_WEEKS:
        raise ValueError("最近六个完整周的有效跑步距离不足两周，无法生成训练计划")
    return sum(active_totals) / active_weeks, active_weeks
