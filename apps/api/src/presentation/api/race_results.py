from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from infrastructure.auth.models import Athlete
from infrastructure.repositories.race_results import RaceResultRepo
from presentation.api.race_results_contracts import RaceResultCreate, RaceResultResponse
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/race-results", tags=["race-results"])


def get_race_results_repo() -> RaceResultRepo:
    return RaceResultRepo()


@router.get("", response_model=list[RaceResultResponse])
async def list_race_results(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[RaceResultRepo, Depends(get_race_results_repo)],
) -> list[RaceResultResponse]:
    results = await repo.list_for_athlete(athlete.id)
    return [RaceResultResponse.model_validate(result) for result in results]


@router.post("", response_model=RaceResultResponse, status_code=status.HTTP_201_CREATED)
async def create_race_result(
    payload: RaceResultCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[RaceResultRepo, Depends(get_race_results_repo)],
) -> RaceResultResponse:
    result = await repo.create(
        athlete.id,
        payload.event_name,
        payload.distance_category,
        payload.time_s,
        payload.race_date,
        payload.a1_certified,
        payload.activity_id,
    )
    return RaceResultResponse.model_validate(result)


@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_race_result(
    result_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[RaceResultRepo, Depends(get_race_results_repo)],
) -> Response:
    if not await repo.delete(athlete.id, result_id):
        raise NotFoundError("race result not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
