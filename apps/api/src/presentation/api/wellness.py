import statistics
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from infrastructure.auth.models import Athlete
from infrastructure.repositories.wellness import WellnessRepo
from presentation.api.analytics_health_contracts import (
    SleepAggregatesResponse,
    SleepAnalysisResponse,
    SleepNightResponse,
    WellnessEntryResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/wellness", tags=["wellness"])

SLEEP_TARGET_SECS = 7 * 3600  # 7-hour target per night
MIN_SAMPLES_FOR_STDEV = 2


@router.get("", response_model=list[WellnessEntryResponse], deprecated=True)
async def get_wellness(
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[WellnessEntryResponse]:
    rows = await WellnessRepo().list_range(athlete.id, start, end)
    return [WellnessEntryResponse.model_validate(row) for row in rows]


async def _fetch_sleep_data(athlete_id: UUID, start: date, end: date) -> list[dict[str, object]]:
    """Fetch sleep-related columns from health_wellness for a date range."""
    return await WellnessRepo().sleep_range(athlete_id, start, end)


def _compute_sleep_aggregates(
    rows: list[dict[str, object]],
) -> dict[str, object | None]:
    """Compute 7-day sleep aggregates from per-night rows (last 7 entries)."""
    recent = rows[-7:]
    values: list[float] = []
    for r in recent:
        v = r.get("sleep_secs")
        if isinstance(v, (int, float)):
            values.append(float(v))
    if not values:
        return {
            "avg_total_sleep_7d": None,
            "sleep_debt_7d": None,
            "consistency_score": None,
        }
    avg_val = sum(values) / len(values)
    debt = sum(v - SLEEP_TARGET_SECS for v in values)
    if len(values) >= MIN_SAMPLES_FOR_STDEV:
        cv = statistics.stdev(values) / avg_val
        consistency = max(0, min(100, round(100 - cv * 100)))
    else:
        consistency = None
    return {
        "avg_total_sleep_7d": round(avg_val),
        "sleep_debt_7d": round(debt),
        "consistency_score": consistency,
    }


@router.get("/sleep", response_model=SleepAnalysisResponse, deprecated=True)
async def get_sleep_analysis(
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> SleepAnalysisResponse:
    """Dedicated sleep analysis endpoint returning per-night breakdown + 7d aggregates.

    Returns null for fields not present in source data (sleep_start, sleep_end,
    deep_sleep_s, rem_sleep_s, light_sleep_s, awake_count) — these are reserved
    for future integration with stage-level sleep trackers.
    """
    rows = await _fetch_sleep_data(athlete.id, start, end)
    nights = [
        SleepNightResponse.model_validate(
            {
                "date": row["day"],
                "sleep_start": None,
                "sleep_end": None,
                "total_sleep_s": row.get("sleep_secs"),
                "deep_sleep_s": None,
                "rem_sleep_s": None,
                "light_sleep_s": None,
                "awake_count": None,
                "sleep_score": row.get("sleep_score"),
            }
        )
        for row in rows
    ]
    aggregates = SleepAggregatesResponse.model_validate(_compute_sleep_aggregates(rows))
    return SleepAnalysisResponse(nights=nights, aggregates=aggregates)
