"""自感用力度（RPE）的手动录入。

来源系统不一定带 RPE，运动员跑完自己知道这次有多累。写入落在
``activity_summary.rpe``；同步时若来源没有提供 RPE，已录入的值保留。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity_manual import set_activity_rpe
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/activities", tags=["activities"])


class RpeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    # 1 是最轻松，10 是拼尽全力；null 表示清除记录。
    rpe: int | None = Field(default=None, ge=1, le=10)


class RpeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    activity_id: str
    rpe: int | None


@router.patch("/{activity_id}/rpe", response_model=RpeResponse)
async def update_rpe(
    activity_id: str,
    payload: RpeUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> RpeResponse:
    updated = await set_activity_rpe(athlete.id, activity_id, payload.rpe)
    if not updated:
        raise NotFoundError("activity not found")
    return RpeResponse(activity_id=activity_id, rpe=payload.rpe)
