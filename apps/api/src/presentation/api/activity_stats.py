"""GET /api/activities/stats — aggregate activity metrics grouped by sport.

Extracted from activities.py to keep that router under the 250 LOC cap.
Mirrors the strength / strength_analytics split pattern."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity_stats import ActivityStatsRepo
from presentation.api.schemas import ActivityStatsResponse, SportStatsBucket
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/activities", tags=["activities"])


def get_activity_stats_repo() -> ActivityStatsRepo:
    return ActivityStatsRepo()


@router.get("/stats", response_model=ActivityStatsResponse)
async def get_activity_stats(
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    sport: str | None = Query(default=None, description="Filter by sport (e.g. Run, Ride)"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityStatsRepo = Depends(get_activity_stats_repo),
) -> ActivityStatsResponse:
    rows = await repo.aggregate_by_sport(athlete.id, start, end, sport)
    buckets = [_to_bucket(row) for row in rows]
    total_distance = sum(bucket.total_distance_m for bucket in buckets)
    total_duration = sum(bucket.total_duration_s for bucket in buckets)
    total_tss = sum(bucket.total_tss for bucket in buckets)
    total_count = sum(bucket.activity_count for bucket in buckets)
    return ActivityStatsResponse(
        total_distance_m=total_distance,
        total_duration_s=total_duration,
        total_tss=total_tss,
        activity_count=total_count,
        avg_tss=total_tss / total_count if total_count else 0.0,
        by_sport=buckets,
    )


def _to_bucket(row: dict[str, Any]) -> SportStatsBucket:
    count = int(row["activity_count"])
    total_tss = float(row["total_tss"])
    return SportStatsBucket(
        sport=str(row["sport"]),
        total_distance_m=float(row["total_distance_m"]),
        total_duration_s=int(row["total_duration_s"]),
        total_tss=total_tss,
        activity_count=count,
        avg_tss=total_tss / count if count else 0.0,
    )
