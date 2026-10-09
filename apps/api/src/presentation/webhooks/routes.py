from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from application.webhooks.handler import WebhookHandler
from infrastructure.webhooks.repo import WebhookEventStore
from infrastructure.webhooks.settings import settings

from .schemas import WebhookAckResponse, WebhookPayload, event_key

router = APIRouter(tags=["webhooks"])


def get_event_store() -> WebhookEventStore:
    return WebhookEventStore()


def get_webhook_handler() -> WebhookHandler:
    return WebhookHandler()


@router.post("/intervals", response_model=WebhookAckResponse)
async def receive_webhook(
    payload: WebhookPayload,
    _request: Request,
    background_tasks: BackgroundTasks,
    store: Annotated[WebhookEventStore, Depends(get_event_store)],
    handler: Annotated[WebhookHandler, Depends(get_webhook_handler)],
) -> WebhookAckResponse:
    if payload.secret != settings.webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid webhook secret"
        )

    inserted = await store.insert_once(event_key(payload), payload.type, payload.athlete_id)
    if inserted:
        background_tasks.add_task(handler.handle, payload)
    return WebhookAckResponse()
