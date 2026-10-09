from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from application.plan.generator_service import generate_plan
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.goals import GoalsRepo
from presentation.api.schemas_core import RunWorkoutSegment
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/plan", tags=["plan"])
WEEKDAY_MAX = 6


class PlanGenerateRequest(BaseModel):
    goal_id: UUID
    rest_days: int | None = Field(default=None, ge=0, le=6)
    preferred_days_off: list[int] | None = Field(default=None, max_length=7)
    weekly_tss: float | None = Field(default=None, gt=0, le=2000)

    @field_validator("preferred_days_off")
    @classmethod
    def _weekday_range(cls, days: list[int] | None) -> list[int] | None:
        if days is not None and (
            any(day < 0 or day > WEEKDAY_MAX for day in days) or len(days) != len(set(days))
        ):
            raise ValueError("休息日必须是互不重复的星期编号 0 至 6")
        return days


class PlanPhasePreview(BaseModel):
    name: str
    start_date: date
    end_date: date
    target_weekly_tss: float


class PlanEventPreview(BaseModel):
    event_id: str
    date: date
    name: str
    training_type: str
    category: str = "workout"
    duration_min: int
    predicted_tss: float
    pace_min_s_km: int | None = None
    pace_max_s_km: int | None = None
    segments: list[RunWorkoutSegment]
    phase: str


class PlanGenerateResponse(BaseModel):
    phases_created: int
    events_created: int
    affected_dates: list[date] | None = None
    phases: list[PlanPhasePreview] | None = None
    events: list[PlanEventPreview] | None = None
    training_paces_available: bool | None = None
    training_load_available: bool | None = None


class TrainingPhaseResponse(BaseModel):
    phase_id: UUID
    goal_id: UUID
    name: str
    start_date: date
    end_date: date
    target_weekly_tss: float | None = None


def get_goals_repo() -> GoalsRepo:
    return GoalsRepo()


@router.post("/generate", response_model=PlanGenerateResponse)
async def generate_training_plan(
    payload: PlanGenerateRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    dry_run: Annotated[bool, Query()] = False,
) -> PlanGenerateResponse:
    try:
        async with get_pool().connection() as conn:
            plan = await generate_plan(
                athlete.id,
                payload.goal_id,
                conn,
                dry_run=dry_run,
                rest_days=payload.rest_days,
                preferred_days_off=payload.preferred_days_off,
                weekly_tss=payload.weekly_tss,
            )
            return PlanGenerateResponse.model_validate(plan)
    except ValueError as exc:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "找不到" in str(exc)
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        detail = str(exc)
        if status_code == status.HTTP_404_NOT_FOUND and detail.startswith("找不到"):
            detail = "目标不存在"
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/periodization", response_model=list[TrainingPhaseResponse])
async def get_periodization(
    goal_id: Annotated[UUID, Query()],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> list[TrainingPhaseResponse]:
    if await repo.get(athlete.id, goal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    phases = await repo.list_training_phases(athlete.id, goal_id)
    return [TrainingPhaseResponse.model_validate(row) for row in phases]
