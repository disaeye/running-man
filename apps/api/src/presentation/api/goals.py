from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from application.goals.progress import refresh_goal_progress
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.goals import GoalsRepo
from presentation.api.schemas import (
    GoalCreate,
    GoalResponse,
    GoalUpdate,
    MilestoneCreate,
    MilestoneResponse,
)
from presentation.api.schemas_core import MilestoneUpdate
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/goals", tags=["goals"])


def get_goals_repo() -> GoalsRepo:
    return GoalsRepo()


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> list[GoalResponse]:
    return [GoalResponse.model_validate(row) for row in await repo.list(athlete.id)]


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    payload: GoalCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> GoalResponse:
    return GoalResponse.model_validate(await repo.create(athlete.id, payload.model_dump()))


@router.post("/refresh-all", response_model=list[GoalResponse])
async def refresh_all_goals(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> list[GoalResponse]:
    goals = [goal for goal in await repo.list(athlete.id) if goal["status"] == "active"]
    refreshed: list[dict[str, object]] = []
    async with get_pool().connection() as conn:
        for goal in goals:
            refreshed.append(
                await refresh_goal_progress(athlete.id, UUID(str(goal["goal_id"])), conn)
            )
    return [GoalResponse.model_validate(goal) for goal in refreshed]


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> GoalResponse:
    row = await repo.get(athlete.id, goal_id)
    if row is None:
        raise NotFoundError("goal not found")
    return GoalResponse.model_validate(row)


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    payload: GoalUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> GoalResponse:
    row = await repo.update(athlete.id, goal_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    return GoalResponse.model_validate(row)


@router.post("/{goal_id}/refresh", response_model=GoalResponse)
async def refresh_goal(
    goal_id: UUID, athlete: Annotated[Athlete, Depends(get_current_athlete)]
) -> GoalResponse:
    try:
        async with get_pool().connection() as conn:
            refreshed = await refresh_goal_progress(athlete.id, goal_id, conn)
            return GoalResponse.model_validate(refreshed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found") from exc


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> Response:
    if not await repo.delete(athlete.id, goal_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{goal_id}/milestones", response_model=list[MilestoneResponse])
async def list_milestones(
    goal_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> list[MilestoneResponse]:
    if await repo.get(athlete.id, goal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    return [MilestoneResponse.model_validate(row) for row in await repo.list_milestones(goal_id)]


@router.post(
    "/{goal_id}/milestones", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED
)
async def create_milestone(
    goal_id: UUID,
    payload: MilestoneCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> MilestoneResponse:
    if await repo.get(athlete.id, goal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    milestone = await repo.create_milestone(goal_id, payload.model_dump())
    return MilestoneResponse.model_validate(milestone)


@router.put("/{goal_id}/milestones/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    goal_id: UUID,
    milestone_id: UUID,
    payload: MilestoneUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> MilestoneResponse:
    if await repo.get(athlete.id, goal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="goal not found")
    row = await repo.update_milestone(goal_id, milestone_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="milestone not found")
    return MilestoneResponse.model_validate(row)
