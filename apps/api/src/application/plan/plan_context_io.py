from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.sports import is_running

WEEKDAY_MAX = 6


async def load_goal(
    athlete_id: UUID, goal_id: UUID, db_conn: AsyncConnection[DictRow]
) -> dict[str, object]:
    async with db_conn.cursor() as cur:
        await cur.execute(
            """
            SELECT goal_id, athlete_id, type::text AS type, title, target_value,
                   unit::text AS unit, target_date, race_distance_m, race_target_time_s
            FROM goals
            WHERE athlete_id = %s AND goal_id = %s AND status <> 'abandoned'
            """,
            (athlete_id, goal_id),
        )
        row = await cur.fetchone()
    if row is None:
        raise ValueError("找不到训练目标")
    return dict(row)


def validate_goal(goal: dict[str, object]) -> tuple[date, float]:
    if str(goal.get("type") or "").lower() != "event":
        raise ValueError("训练计划只能用于跑步比赛目标")
    target_date = goal.get("target_date")
    if not isinstance(target_date, date):
        raise ValueError("目标日期为必填项")
    race_distance = goal.get("race_distance_m")
    if isinstance(race_distance, bool) or not isinstance(race_distance, int | float):
        raise ValueError("比赛距离为必填项")
    race_distance_m = float(race_distance)
    if race_distance_m <= 0:
        raise ValueError("比赛距离为必填项")
    return target_date, race_distance_m


async def validate_running_athlete(athlete_id: UUID, db_conn: AsyncConnection[DictRow]) -> None:
    async with db_conn.cursor() as cur:
        await cur.execute("SELECT preferred_sport FROM athletes WHERE id = %s", (athlete_id,))
        athlete_row = await cur.fetchone()
    if athlete_row is None:
        raise ValueError("找不到运动员资料")
    preferred = str(athlete_row.get("preferred_sport") or "").strip()
    # 未填写主运动时视为跑步：生成器只排跑步课，空值拦截没有意义。
    if preferred and not is_running(preferred):
        raise ValueError("训练计划只能用于跑步比赛目标")


def valid_days(days: list[int] | None) -> list[int]:
    if days is None:
        return []
    return sorted({day for day in days if 0 <= day <= WEEKDAY_MAX})


def default_days_off(race_date: date, today: date, rest_days: int) -> list[int]:
    _ = race_date, today
    return [5, 2, 0, 4, 1, 3, 6][: min(max(rest_days, 0), 7)]


def goal_title(goal: dict[str, object]) -> str | None:
    return str(goal.get("title") or "比赛") if goal.get("type") == "event" else None


def sorted_events(events: list[dict[str, object]]) -> list[dict[str, object]]:
    def start_time(event: dict[str, object]) -> datetime:
        value = event["start_time"]
        if not isinstance(value, datetime):
            raise ValueError("event start_time must be a datetime")
        return value

    return sorted(events, key=start_time)
