from datetime import date, datetime
from typing import cast

from fastapi import HTTPException, status

from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivityRepo
from presentation.api.schemas import ActivityDetail, ActivitySummary, LapResponse
from presentation.api.schemas_stream import StreamPoint
from presentation.errors import NotFoundError

_WEATHER_ROW_FIELDS = (
    "weather_avg_temp",
    "weather_min_temp",
    "weather_max_temp",
    "weather_feels_like",
    "weather_wind_speed",
    "weather_wind_gust",
    "weather_wind_deg",
    "weather_headwind_pct",
    "weather_tailwind_pct",
    "weather_clouds_pct",
    "weather_max_rain",
    "weather_max_snow",
)


def _with_weather_block(row: dict[str, object]) -> dict[str, object]:
    """把行里的 weather_* 列打包成嵌套 weather 对象；全部为空时不输出。"""
    weather = {
        key.removeprefix("weather_"): row.pop(key) for key in _WEATHER_ROW_FIELDS if key in row
    }
    row["weather"] = weather if any(value is not None for value in weather.values()) else None
    return row


async def list_activities(
    start: date, end: date, athlete: Athlete, repo: ActivityRepo
) -> list[ActivitySummary]:
    rows = await repo.list_by_range(athlete.id, start, end)
    return [ActivitySummary.model_validate(row) for row in rows]


async def get_activity(activity_id: str, athlete: Athlete, repo: ActivityRepo) -> ActivityDetail:
    row = await repo.get_by_id(athlete.id, activity_id)
    if row:
        return ActivityDetail.model_validate(_with_weather_block(row))
    if await repo.exists(activity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="activity belongs to another athlete"
        )
    raise NotFoundError("activity not found")


async def get_streams(activity_id: str, athlete: Athlete, repo: ActivityRepo) -> list[StreamPoint]:
    activity = await repo.get_by_id(athlete.id, activity_id)
    if not activity and await repo.exists(activity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="activity belongs to another athlete"
        )
    # 活动不存在时保持 200 空列表的既有行为，此时无需查询流分区。
    if activity is None:
        return []
    start_time = activity.get("start_time")
    if not isinstance(start_time, datetime) or start_time.tzinfo is None:
        raise ValueError("activity row must carry a timezone-aware start_time")
    rows = await repo.get_streams(athlete.id, activity_id, start_time)
    return [StreamPoint.model_validate(row) for row in rows]


async def get_laps(activity_id: str, athlete: Athlete, repo: ActivityRepo) -> list[LapResponse]:
    if not await repo.get_by_id(athlete.id, activity_id):
        if await repo.exists(activity_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        raise NotFoundError("activity not found")
    laps = await repo.get_laps(athlete.id, activity_id)
    return [LapResponse.model_validate(_with_avg_pace(lap)) for lap in laps]


def _with_avg_pace(lap: dict[str, object]) -> dict[str, object]:
    duration_s = float(cast(float, lap.get("duration_s") or 0))
    distance_km = float(cast(float, lap.get("distance_m") or 0)) / 1000
    lap["avg_pace"] = round(duration_s / distance_km, 1) if distance_km else 0.0
    return lap
