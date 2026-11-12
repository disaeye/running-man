"""比赛结案：候选活动的匹配与实际完赛成绩的写入。"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from infrastructure.auth.models import Athlete
from infrastructure.repositories.goal_race_results import GoalRaceRepo
from infrastructure.repositories.goals import GoalsRepo
from presentation.api.goal_schemas import GoalResponse
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/goals", tags=["goals"])


def get_goals_repo() -> GoalsRepo:
    return GoalsRepo()


class GoalRaceCandidate(BaseModel):
    """比赛日附近可作为结案依据的活动。"""

    model_config = ConfigDict(extra="forbid", frozen=True)

    activity_id: str
    start_time: datetime
    sport: str
    name: str | None = None
    distance_m: float | None = None
    duration_s: int | None = None
    is_race: bool = False


class GoalRaceCandidateList(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    candidates: list[GoalRaceCandidate]


class GoalResultCreate(BaseModel):
    """比赛结案：活动与完赛用时至少提供一个。"""

    model_config = ConfigDict(extra="forbid", frozen=True)

    activity_id: str | None = None
    finish_time_s: int | None = Field(default=None, ge=60, le=172_800)


async def _require_event_goal(
    repo: GoalsRepo, athlete_id: UUID, goal_id: UUID
) -> dict[str, object]:
    goal = await repo.get(athlete_id, goal_id)
    if goal is None:
        raise NotFoundError("goal not found")
    if str(goal.get("type")) != "event":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="只有比赛目标可以记录比赛结果",
        )
    return goal


def _distance_or_none(distance: object) -> float | None:
    """目标距离转 float；缺值或类型不对时返回 None。"""
    if isinstance(distance, int | float) and not isinstance(distance, bool):
        return float(distance)
    return None


@router.get("/{goal_id}/race-candidates", response_model=GoalRaceCandidateList)
async def list_race_candidates(
    goal_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> GoalRaceCandidateList:
    """比赛日 ±1 天内可作为结案依据的活动。"""
    goal = await _require_event_goal(repo, athlete.id, goal_id)
    target = goal.get("target_date")
    if not isinstance(target, date):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="目标没有比赛日期，无法匹配活动",
        )
    race_day: date = target
    distance = goal.get("race_distance_m")
    rows = await GoalRaceRepo().race_candidates(
        athlete.id, goal_id, race_day, _distance_or_none(distance)
    )
    return GoalRaceCandidateList(candidates=[GoalRaceCandidate.model_validate(row) for row in rows])


@router.post("/{goal_id}/result", response_model=GoalResponse)
async def record_race_result(
    goal_id: UUID,
    payload: GoalResultCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[GoalsRepo, Depends(get_goals_repo)],
) -> GoalResponse:
    """写入实际完赛成绩并把目标结案为已达成。"""
    goal = await _require_event_goal(repo, athlete.id, goal_id)
    if payload.activity_id is None and payload.finish_time_s is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="请提供比赛活动或完赛用时",
        )
    finish_time_s = payload.finish_time_s
    activity_id = payload.activity_id
    if activity_id is not None:
        target = goal.get("target_date")
        if not isinstance(target, date):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="目标没有比赛日期，无法匹配活动",
            )
        race_day: date = target
        distance = goal.get("race_distance_m")
        candidates = await GoalRaceRepo().race_candidates(
            athlete.id,
            goal_id,
            race_day,
            float(distance) if isinstance(distance, int | float) else None,
        )
        known = {str(row.get("activity_id")): row for row in candidates}
        if activity_id not in known:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="这个活动不在比赛日范围内，不能作为结案依据",
            )
        if finish_time_s is None:
            duration = known[activity_id].get("duration_s")
            if isinstance(duration, int):
                finish_time_s = duration
    row = await GoalRaceRepo().record_race_result(athlete.id, goal_id, finish_time_s, activity_id)
    if row is None:
        raise NotFoundError("goal not found")
    return GoalResponse.model_validate(row)
