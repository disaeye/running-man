from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from application.plan.generator_service import PlanRequest, generate_plan
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.goal_milestone_repo import GoalMilestoneRepo
from infrastructure.repositories.goals import GoalsRepo
from infrastructure.repositories.plan_revisions import PlanRevisionRepo
from presentation.api.schemas_core import RunWorkoutSegment
from presentation.api.schemas_run import (
    IntensityAnchor,
    PlanEvidencePayload,
    QualityTarget,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/plan", tags=["plan"])
WEEKDAY_MAX = 6


class PlanGenerateRequest(BaseModel):
    goal_id: UUID
    rest_days: int | None = Field(default=None, ge=0, le=6)
    preferred_days_off: list[int] | None = Field(default=None, max_length=7)
    # 运动员指定的长距离日（星期几），不填则由生成器安排。
    long_run_day: int | None = Field(default=None, ge=0, le=WEEKDAY_MAX)

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
    target_weekly_distance_m: float


class PlanEventPreview(BaseModel):
    event_id: str
    date: date
    name: str
    training_type: str
    category: str = "workout"
    duration_min: int
    # 预计训练压力（rTSS 近似）；缺配速时为 None。
    predicted_tss: float | None = None
    pace_min_s_km: int | None = None
    pace_max_s_km: int | None = None
    # 目标距离（米）。没有配速可推算时为 None。
    predicted_distance_m: float | None = None
    segments: list[RunWorkoutSegment]
    phase: str
    structure: str | None = None
    session_type: str | None = None
    primary_stimulus: str | None = None
    pacing_pattern: str | None = None
    display_line: str | None = None
    target_domain: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    rationale: str | None = None
    target_adaptation: str | None = None
    intensity_anchor: IntensityAnchor | None = None
    quality_target: QualityTarget | None = None
    evidence: PlanEvidencePayload | None = None


class PlanPreservedPreview(BaseModel):
    """重生成时会被保留的现有课表（已手动修改或已完成）。"""

    date: date
    name: str
    reason: str


class PlanRevisionSummary(BaseModel):
    revision_id: str
    reason: str
    events_created: int
    phases_created: int
    created_at: datetime | None = None


class PlanRevisionDetail(PlanRevisionSummary):
    events: list[PlanEventPreview] = Field(default_factory=list)
    phases: list[PlanPhasePreview] = Field(default_factory=list)


class PlanGenerateResponse(BaseModel):
    phases_created: int
    events_created: int
    affected_dates: list[date] | None = None
    preserved: list[PlanPreservedPreview] = Field(default_factory=list)
    phases: list[PlanPhasePreview] | None = None
    events: list[PlanEventPreview] | None = None
    training_paces_available: bool | None = None
    running_history_weeks: int | None = None


class TrainingPhaseResponse(BaseModel):
    phase_id: UUID
    goal_id: UUID
    name: str
    start_date: date
    end_date: date
    target_weekly_distance_m: float | None = None


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
                PlanRequest(
                    dry_run=dry_run,
                    rest_days=payload.rest_days,
                    preferred_days_off=payload.preferred_days_off,
                    long_run_day=payload.long_run_day,
                ),
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
    phases = await GoalMilestoneRepo().list_training_phases(athlete.id, goal_id)
    return [TrainingPhaseResponse.model_validate(row) for row in phases]


@router.get("/revisions", response_model=list[PlanRevisionSummary])
async def list_plan_revisions(
    goal_id: Annotated[UUID, Query()],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> list[PlanRevisionSummary]:
    """一个目标的全部计划版本，最新在前。"""
    if await repo.get(athlete.id, goal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    rows = await PlanRevisionRepo().list_for_goal(athlete.id, goal_id)
    return [PlanRevisionSummary.model_validate(row) for row in rows]


@router.get("/revisions/{revision_id}", response_model=PlanRevisionDetail)
async def get_plan_revision(
    revision_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> PlanRevisionDetail:
    """单个版本的完整快照：当时排定的全部课表与阶段。"""
    row = await PlanRevisionRepo().get(athlete.id, revision_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="revision not found")
    return PlanRevisionDetail.model_validate(row)
