from __future__ import annotations

from datetime import date
from uuid import UUID

from infrastructure.repositories.analytics import AnalyticsRepo


async def _streams_for_range(
    athlete_id: UUID, start: date, end: date, metric_types: list[str]
) -> dict[str, list[dict[str, object]]]:
    return await AnalyticsRepo().streams_for_range(athlete_id, start, end, metric_types)


async def _streams_for_activities(
    athlete_id: UUID, activity_ids: list[str], metric_types: list[str] | None = None
) -> dict[str, list[dict[str, object]]]:
    return await AnalyticsRepo().streams_for_activities(athlete_id, activity_ids, metric_types)


async def _power_streams_for_activities(
    athlete_id: UUID, activity_ids: list[str]
) -> dict[str, list[float]]:
    streams = await _streams_for_activities(athlete_id, activity_ids, ["power"])
    return {
        activity_id: [
            float(value)
            for row in rows
            if row.get("metric_type") == "power"
            and isinstance((value := row.get("value")), int | float)
        ]
        for activity_id, rows in streams.items()
    }
