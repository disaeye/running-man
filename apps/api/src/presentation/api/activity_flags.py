"""Endpoints for ignoring, deleting and restoring activities.

Split from ``activities.py`` (which is at the repository's file-size limit)
and kept together because the operations are one story: an activity can be
taken out of the numbers temporarily (ignore), hidden entirely (delete), or
brought back either way (un-ignore / restore).

Both flags are excluded from derived numbers by the ``activity_compute`` view,
so every mutation here ends with a recompute — otherwise the stored PMC and
daily facts would keep describing a set of activities that no longer counts.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from application.activities.ignore import (
    ActivityNotFoundError,
    list_ignored,
    list_trashed,
    restore,
    set_ignored,
    set_ignored_bulk,
)
from application.computation.orchestration import enqueue_activity_recompute
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivityRepo
from presentation.api.activities import get_activity_repo
from presentation.api.schemas_core import (
    BulkIgnoreRequest,
    BulkIgnoreResult,
    FlaggedActivity,
    IgnoreResult,
    RestoreResult,
)
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/activities", tags=["activities"])

# Literal paths must be declared before ``/{activity_id}`` in the including
# router: FastAPI matches in registration order, so a later "/ignored" would be
# captured as an activity id and answer 404.
router.tags = ["activities"]


@router.get("/ignored", response_model=list[FlaggedActivity])
async def get_ignored_activities(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[FlaggedActivity]:
    """Activities excluded from the numbers but still visible in lists."""
    return [FlaggedActivity.model_validate(row) for row in await list_ignored(athlete.id)]


@router.get("/trash", response_model=list[FlaggedActivity])
async def get_trashed_activities(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[FlaggedActivity]:
    """Soft-deleted activities, restorable."""
    return [
        FlaggedActivity.model_validate(row) for row in await list_trashed(athlete.id)
    ]


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: str,
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> None:
    """Soft-delete: keep the row with ``deleted_at`` set.

    The athlete can restore it and the sync will not re-import it. Derived
    numbers exclude it immediately (they read ``activity_compute``).
    """
    soft_deleted = await repo.soft_delete(athlete.id, activity_id)
    if not soft_deleted:
        if await repo.exists(activity_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="activity belongs to another athlete"
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="activity not found")
    await enqueue_activity_recompute(athlete.id, "delete:activity")


@router.post("/{activity_id}/ignore", response_model=IgnoreResult)
async def ignore_activity(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> IgnoreResult:
    """Exclude an activity from load, PMC, records and zone statistics.

    Unlike deletion the activity stays visible in lists, so the athlete can see
    where it went and undo the choice.
    """
    return await _set_ignored(athlete.id, activity_id, True)


@router.delete("/{activity_id}/ignore", response_model=IgnoreResult)
async def unignore_activity(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> IgnoreResult:
    """Return an ignored activity to the numbers."""
    return await _set_ignored(athlete.id, activity_id, False)


@router.post("/{activity_id}/restore", response_model=RestoreResult)
async def restore_activity(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> RestoreResult:
    """Undo a soft delete."""
    if not await restore(athlete.id, activity_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="activity is not in the trash",
        )
    generation = await enqueue_activity_recompute(athlete.id, "restore:activity")
    return RestoreResult(
        activity_id=activity_id,
        deleted=False,
        recompute_status="queued",
        recompute_generation=generation,
    )


@router.post("/ignore", response_model=BulkIgnoreResult)
async def ignore_activities_bulk(
    payload: BulkIgnoreRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> BulkIgnoreResult:
    """Ignore or un-ignore several activities at once.

    Bulk ignoring is the common case: a sync tends to deliver a batch of walks
    or commutes together, and clearing them one at a time is tedious.
    """
    updated = await set_ignored_bulk(athlete.id, payload.activity_ids, payload.ignored)
    generation = (
        await enqueue_activity_recompute(athlete.id, "ignore:bulk") if updated else None
    )
    return BulkIgnoreResult(
        updated=updated,
        ignored=payload.ignored,
        recompute_status="queued" if generation is not None else None,
        recompute_generation=generation,
    )


async def _set_ignored(
    athlete_id: UUID, activity_id: str, ignored: bool
) -> IgnoreResult:
    try:
        value = await set_ignored(athlete_id, activity_id, ignored)
    except ActivityNotFoundError as error:
        raise NotFoundError("activity not found") from error
    generation = await enqueue_activity_recompute(
        athlete_id, "ignore:activity" if value else "unignore:activity"
    )
    return IgnoreResult(
        activity_id=activity_id,
        ignored=value,
        recompute_status="queued",
        recompute_generation=generation,
    )
