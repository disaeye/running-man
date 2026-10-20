from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from application.webhooks.athlete_lookup import resolve_athlete
from application.webhooks.handler import WebhookHandler
from infrastructure.webhooks.repo import WebhookEventStore
from infrastructure.webhooks.settings import settings

from .schemas import WebhookAckResponse, WebhookPayload, event_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def get_event_store() -> WebhookEventStore:
    return WebhookEventStore()


def get_webhook_handler() -> WebhookHandler:
    return WebhookHandler()


def get_athlete_resolver() -> Callable[[str], Awaitable[UUID | None]]:
    """Maps an upstream athlete id to this system's athlete.

    A dependency so a test can answer it without an encrypted integration row.
    """
    return resolve_athlete


@router.post("/intervals", response_model=WebhookAckResponse)
async def receive_webhook(
    payload: WebhookPayload,
    _request: Request,
    background_tasks: BackgroundTasks,
    store: Annotated[WebhookEventStore, Depends(get_event_store)],
    handler: Annotated[WebhookHandler, Depends(get_webhook_handler)],
    resolve: Annotated[Callable[[str], Awaitable[UUID | None]], Depends(get_athlete_resolver)],
) -> WebhookAckResponse:
    if payload.secret != settings.webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid webhook secret"
        )

    athlete_id: UUID | None = None
    if payload.athlete_id:
        athlete_id = await resolve(payload.athlete_id)
        if athlete_id is None:
            # Acknowledge without storing. The event key is the primary key of
            # `webhook_events`, so a row for an athlete nobody owns would block
            # the legitimate event of the same type, timestamp and activity for
            # every later delivery. An error status would only make the sender
            # retry something that can never succeed.
            logger.warning(
                "dropping %s webhook for unknown Intervals.icu athlete %r",
                payload.type,
                payload.athlete_id,
            )
            return WebhookAckResponse()

    inserted = await store.insert_once(
        event_key(payload), payload.type, str(athlete_id) if athlete_id is not None else None
    )
    if inserted:
        background_tasks.add_task(handler.handle, payload, athlete_id)
    return WebhookAckResponse()
