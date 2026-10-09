from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from application.notifications.scanner import scan_all_athletes
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories import (
    list_notifications,
    mark_all_read,
    mark_read,
)
from presentation.api.notification_contracts import (
    NotificationReadAllResponse,
    NotificationReadResponse,
    NotificationResponse,
    NotificationScanResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_athlete_notifications(
    unread_only: bool = Query(default=False),
    athlete: Athlete = Depends(get_current_athlete),
) -> list[NotificationResponse]:
    return [
        NotificationResponse.model_validate(row)
        for row in await list_notifications(athlete.id, unread_only=unread_only)
    ]


@router.post("/{notification_id}/read", response_model=NotificationReadResponse)
async def mark_notification_read(
    notification_id: UUID,
    athlete: Athlete = Depends(get_current_athlete),
) -> NotificationReadResponse:
    if not await mark_read(notification_id, athlete.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="notification not found",
        )
    return NotificationReadResponse(ok=True)


@router.post("/read-all", response_model=NotificationReadAllResponse)
async def mark_notifications_read(
    athlete: Athlete = Depends(get_current_athlete),
) -> NotificationReadAllResponse:
    return NotificationReadAllResponse(updated=await mark_all_read(athlete.id))


@router.post("/scan", response_model=NotificationScanResponse)
async def trigger_scan(
    athlete: Athlete = Depends(get_current_athlete),
) -> NotificationScanResponse:
    """Scan all athletes for actionable notifications."""
    async with get_pool().connection() as conn:
        return NotificationScanResponse.model_validate(await scan_all_athletes(conn))
