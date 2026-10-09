from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from domain.workout.predict import project_future
from infrastructure.auth.models import Athlete
from infrastructure.repositories.workout_templates import WorkoutTemplateRepo
from presentation.api.workout_schemas import (
    WorkoutPredictionPoint,
    WorkoutPredictionRequest,
    WorkoutTemplateCreate,
    WorkoutTemplateResponse,
    WorkoutTemplateUpdate,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/workouts", tags=["workouts"])


def get_template_repo() -> WorkoutTemplateRepo:
    return WorkoutTemplateRepo()


@router.post("/predict", response_model=list[WorkoutPredictionPoint])
async def predict_workout(
    payload: WorkoutPredictionRequest,
    _athlete: Athlete = Depends(get_current_athlete),
) -> list[WorkoutPredictionPoint]:
    points = project_future(
        historical_daily_tss=payload.historical_daily_tss,
        planned_workouts=payload.planned_workouts,
        current_ctl=payload.current_ctl,
        current_atl=payload.current_atl,
        horizon_days=payload.horizon_days,
    )
    return [WorkoutPredictionPoint(**point.__dict__) for point in points]


@router.get("/templates", response_model=list[WorkoutTemplateResponse])
async def list_templates(
    sport: str | None = None,
    goal_type: str | None = Query(default=None, alias="goal"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: WorkoutTemplateRepo = Depends(get_template_repo),
) -> list[dict[str, object]]:
    return await repo.list_templates(athlete.id, sport=sport, goal_type=goal_type)


@router.post(
    "/templates", response_model=WorkoutTemplateResponse, status_code=status.HTTP_201_CREATED
)
async def create_template(
    payload: WorkoutTemplateCreate,
    athlete: Athlete = Depends(get_current_athlete),
    repo: WorkoutTemplateRepo = Depends(get_template_repo),
) -> dict[str, object]:
    return await repo.create_template(athlete.id, payload.model_dump(mode="json"))


@router.put("/templates/{template_id}", response_model=WorkoutTemplateResponse)
async def update_template(
    template_id: UUID,
    payload: WorkoutTemplateUpdate,
    athlete: Athlete = Depends(get_current_athlete),
    repo: WorkoutTemplateRepo = Depends(get_template_repo),
) -> dict[str, object]:
    data = payload.model_dump(mode="json", exclude_unset=True)
    row = await repo.update_template(athlete.id, template_id, data)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return row


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    athlete: Athlete = Depends(get_current_athlete),
    repo: WorkoutTemplateRepo = Depends(get_template_repo),
) -> Response:
    if not await repo.delete_template(athlete.id, template_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
