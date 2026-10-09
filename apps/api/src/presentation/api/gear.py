from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from domain.gear import DEFAULT_RETIREMENT_THRESHOLD_M, check_retirement
from domain.sports import is_running
from infrastructure.auth.models import Athlete
from infrastructure.repositories.gear import GearRepo
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/gear", tags=["gear"])


class ShoeCreate(BaseModel):
    name: str = Field(min_length=1)
    brand: str | None = None
    model: str | None = None
    purchase_date: date | None = None
    notes: str | None = None


class ShoeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    brand: str | None = None
    model: str | None = None
    purchase_date: date | None = None
    notes: str | None = None


class ShoeResponse(BaseModel):
    id: UUID
    athlete_id: UUID
    name: str
    brand: str | None = None
    model: str | None = None
    purchase_date: date | None = None
    current_mileage_m: float | None = None
    mileage_m: float
    retirement_alert: bool
    retired_at: datetime | None = None
    notes: str | None = None
    created_at: datetime


class ShoeAssignmentCreate(BaseModel):
    activity_id: str = Field(min_length=1)


class ShoeAssignmentResponse(BaseModel):
    id: UUID
    activity_id: str
    shoe_id: UUID
    assigned_at: datetime


def get_gear_repo() -> GearRepo:
    return GearRepo()


@router.get("/shoes", response_model=list[ShoeResponse])
async def list_shoes(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> list[ShoeResponse]:
    shoes = await repo.list_shoes(athlete.id)
    return [ShoeResponse.model_validate(await _with_mileage(repo, shoe)) for shoe in shoes]


@router.get("/shoes/{shoe_id}", response_model=ShoeResponse)
async def get_shoe(
    shoe_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> ShoeResponse:
    shoe = await repo.get_shoe(athlete.id, shoe_id)
    if shoe is None:
        raise NotFoundError("shoe not found")
    return ShoeResponse.model_validate(await _with_mileage(repo, shoe))


@router.post("/shoes", response_model=ShoeResponse, status_code=status.HTTP_201_CREATED)
async def create_shoe(
    payload: ShoeCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> ShoeResponse:
    shoe = await repo.create_shoe(
        athlete.id, payload.name, payload.brand, payload.model, payload.purchase_date, payload.notes
    )
    return ShoeResponse.model_validate(await _with_mileage(repo, shoe))


@router.put("/shoes/{shoe_id}", response_model=ShoeResponse)
async def update_shoe(
    shoe_id: UUID,
    payload: ShoeUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> ShoeResponse:
    shoe = await repo.update_shoe(athlete.id, shoe_id, payload.model_dump(exclude_unset=True))
    if shoe is None:
        raise NotFoundError("shoe not found")
    return ShoeResponse.model_validate(await _with_mileage(repo, shoe))


@router.delete("/shoes/{shoe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def retire_shoe(
    shoe_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> Response:
    if not await repo.retire_shoe(athlete.id, shoe_id):
        raise NotFoundError("shoe not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/shoes/{shoe_id}/assign",
    response_model=ShoeAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_shoe(
    shoe_id: UUID,
    payload: ShoeAssignmentCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> ShoeAssignmentResponse:
    shoe = await repo.get_shoe(athlete.id, shoe_id)
    if shoe is None:
        raise NotFoundError("shoe not found")
    activity = await repo.get_activity(athlete.id, payload.activity_id)
    if activity is None:
        raise NotFoundError("activity not found")
    if not is_running(str(activity.get("sport") or "") or None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="activity is not shoe-assignable"
        )
    assignment = await repo.assign_shoe(athlete.id, shoe_id, payload.activity_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="shoe assignment failed"
        )
    return ShoeAssignmentResponse.model_validate(assignment)


@router.delete("/shoes/{shoe_id}/assign/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_shoe(
    shoe_id: UUID,
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GearRepo, Depends(get_gear_repo)],
) -> Response:
    if not await repo.unassign_shoe(athlete.id, shoe_id, activity_id):
        raise NotFoundError("assignment not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _with_mileage(repo: GearRepo, shoe: dict[str, object]) -> dict[str, object]:
    mileage_m = await repo.compute_shoe_mileage(UUID(str(shoe["id"])))
    result = {**shoe, "mileage_m": mileage_m}
    result["retirement_alert"] = check_retirement(result, DEFAULT_RETIREMENT_THRESHOLD_M)
    return result
