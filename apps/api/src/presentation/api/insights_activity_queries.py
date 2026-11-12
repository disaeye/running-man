from datetime import date
from uuid import UUID

from infrastructure.repositories.analytics import AnalyticsRepo

# 个人纪录读全历史；这个起点之前的数据源不存在，用于裁剪分区。
HISTORY_START = date(2000, 1, 1)


async def _activities_for_range(
    athlete_id: UUID, start: date, end: date
) -> list[dict[str, object]]:
    return await AnalyticsRepo().activities_for_range(athlete_id, start, end)


async def _all_activities(athlete_id: UUID, sport: str | None) -> list[dict[str, object]]:
    return await AnalyticsRepo().all_activities(athlete_id, sport, HISTORY_START)
