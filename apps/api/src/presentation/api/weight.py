"""Weight tracking endpoints — backed by health_wellness.weight column."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from infrastructure.auth.models import Athlete
from infrastructure.repositories.weight import WeightRepo
from presentation.api.analytics_health_contracts import (
    WeightDeleteResponse,
    WeightEntryResponse,
    WeightListResponse,
    WeightTrendResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/weight", tags=["weight"])


class WeightUpsert(BaseModel):
    date: date
    weight_kg: float
    body_fat_pct: float | None = None


def get_weight_repo() -> WeightRepo:
    return WeightRepo()


@router.get("", response_model=WeightListResponse)
async def list_weight(
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[WeightRepo, Depends(get_weight_repo)],
) -> WeightListResponse:
    """List weight entries in a date range plus 30-day trend stats."""
    entries = await repo.list_entries(athlete.id, start, end)
    stats = await repo.get_trend_stats(athlete.id)
    return WeightListResponse(
        entries=[WeightEntryResponse.model_validate(entry) for entry in entries],
        stats=WeightTrendResponse.model_validate(stats),
    )


@router.post("", response_model=WeightEntryResponse, status_code=status.HTTP_201_CREATED)
async def upsert_weight(
    body: WeightUpsert,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[WeightRepo, Depends(get_weight_repo)],
) -> WeightEntryResponse:
    """Create or update a weight entry for the authenticated athlete on a given day."""
    entry = await repo.upsert_entry(athlete.id, body.date, body.weight_kg)
    return WeightEntryResponse.model_validate(entry)


@router.delete("/{target_date}", response_model=WeightDeleteResponse)
async def delete_weight(
    target_date: date,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[WeightRepo, Depends(get_weight_repo)],
) -> WeightDeleteResponse:
    """Delete (nullify) weight for a given date."""
    deleted = await repo.delete_entry(athlete.id, target_date)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="weight entry not found")
    return WeightDeleteResponse(status="deleted")
