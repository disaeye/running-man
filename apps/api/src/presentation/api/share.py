from __future__ import annotations

from datetime import date as Date
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from domain.share.redaction import redact_for_public
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.share import ShareRepo
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(tags=["share"])


class ShareCreateResponse(BaseModel):
    token: UUID
    url: str


class PublicActivityResponse(BaseModel):
    sport: str | None = None
    date: Date | None = None
    duration_s: int | None = None
    distance_m: float | None = None
    name: str | None = None


def get_activity_repo() -> ActivityRepo:
    return ActivityRepo()


def get_share_repo() -> ShareRepo:
    return ShareRepo()


@router.post("/activities/{activity_id}/share", response_model=ShareCreateResponse)
async def create_share(
    activity_id: str,
    request: Request,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    activity_repo: Annotated[ActivityRepo, Depends(get_activity_repo)],
    share_repo: Annotated[ShareRepo, Depends(get_share_repo)],
) -> ShareCreateResponse:
    _ = await _owned_activity_or_error(activity_repo, athlete.id, activity_id)
    token = await share_repo.create(athlete.id, activity_id, uuid4())
    return ShareCreateResponse(token=token, url=str(request.url_for("public_share", token=token)))


@router.delete("/activities/{activity_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    activity_repo: Annotated[ActivityRepo, Depends(get_activity_repo)],
    share_repo: Annotated[ShareRepo, Depends(get_share_repo)],
) -> None:
    _ = await _owned_activity_or_error(activity_repo, athlete.id, activity_id)
    _ = await share_repo.revoke(athlete.id, activity_id)


@router.get("/share/{token}", response_model=PublicActivityResponse, name="public_share")
async def public_share(
    token: UUID,
    share_repo: Annotated[ShareRepo, Depends(get_share_repo)],
) -> PublicActivityResponse:
    activity = await share_repo.get_activity_for_token(token)
    if not activity:
        raise NotFoundError("share not found")
    return PublicActivityResponse.model_validate(redact_for_public(activity))


async def _owned_activity_or_error(
    repo: ActivityRepo, athlete_id: UUID, activity_id: str
) -> dict[str, object]:
    row = await repo.get_by_id(athlete_id, activity_id)
    if row:
        return row
    if await repo.exists(activity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="activity belongs to another athlete"
        )
    raise NotFoundError("activity not found")
