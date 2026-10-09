from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import cast
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow


@dataclass(frozen=True)
class AthleteSettings:
    timezone: str
    weekly_training_days: int
    max_session_duration_min: int


async def athlete_settings(
    athlete_id: UUID, db_conn: AsyncConnection[DictRow]
) -> AthleteSettings:
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


async def current_ctl(
    athlete_id: UUID,
    today: date,
    db_conn: AsyncConnection[DictRow],
) -> tuple[float, bool]:
    query = """
    SELECT day, value
    FROM current_daily_facts
    WHERE athlete_id = %s AND sport IS NULL AND metric_key = 'ctl' AND day <= %s
    ORDER BY day DESC
    LIMIT 1
    """
    async with db_conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, today))
        rows = await cur.fetchall()
    if not rows:
        return 0.0, False
    row = rows[0]
    ctl = float(row["value"])
    elapsed = max((today - cast(date, row["day"])).days, 0)
    for _ in range(elapsed):
        ctl += (0.0 - ctl) / 42.0
    return ctl, True


def goal_weekly_tss(goal: dict[str, object]) -> float | None:
    value = goal.get("target_value")
    unit = str(goal.get("unit") or "").lower()
    if str(goal.get("type") or "").lower() != "consistency" or unit not in {"tss", "points"}:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
