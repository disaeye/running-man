from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from infrastructure.auth.models import Athlete
from infrastructure.repositories.strength import StrengthRepo
from presentation.api.analytics_strength_contracts import (
    E1rmTrendResponse,
    MuscleDistributionResponse,
    MuscleVolumeResponse,
)
from presentation.api.strength import get_strength_repo
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/strength/analytics", tags=["strength"])


FromDate = Annotated[date | None, Query(alias="from")]
ToDate = Annotated[date | None, Query(alias="to")]


@router.get("/muscle-volume", response_model=list[MuscleVolumeResponse])
async def muscle_volume(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
    from_date: FromDate = None,
    to_date: ToDate = None,
) -> list[MuscleVolumeResponse]:
    rows = await repo.muscle_volume(athlete.id, from_date, to_date)
    return [MuscleVolumeResponse.model_validate(row) for row in rows]


@router.get("/e1rm", response_model=list[E1rmTrendResponse])
async def e1rm_trend(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
    from_date: FromDate = None,
    to_date: ToDate = None,
) -> list[E1rmTrendResponse]:
    rows = await repo.e1rm_trend(athlete.id, from_date, to_date)
    return [E1rmTrendResponse.model_validate(row) for row in rows]


@router.get("/distribution", response_model=list[MuscleDistributionResponse])
async def muscle_distribution(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
    from_date: FromDate = None,
    to_date: ToDate = None,
) -> list[MuscleDistributionResponse]:
    rows = await repo.muscle_distribution(athlete.id, from_date, to_date)
    return [MuscleDistributionResponse.model_validate(row) for row in rows]
