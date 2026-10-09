from collections.abc import Awaitable, Callable
from importlib import import_module

from infrastructure.webhooks.repo import WebhookEffectRepo
from presentation.webhooks.schemas import CalendarEvent, DeletedEvent, WebhookPayload

SyncFn = Callable[[str | None, str | None], Awaitable[None]]


class WebhookHandler:
    def __init__(
        self, repo: WebhookEffectRepo | None = None, sync_fn: SyncFn | None = None
    ) -> None:
        self.repo: WebhookEffectRepo = repo or WebhookEffectRepo()
        self.sync_fn: SyncFn = sync_fn or _load_sync_fn()

    async def handle(self, payload: WebhookPayload) -> None:
        if payload.type == "ACTIVITY_UPLOADED":
            await self._activity_uploaded(payload)
        elif payload.type == "ACTIVITY_ANALYZED":
            await self._activity_analyzed(payload)
        elif payload.type == "CALENDAR_UPDATED":
            await self._calendar_updated(payload)
        elif payload.type == "SPORT_SETTINGS_UPDATED":
            await self.repo.mark_settings_stale(payload.athlete_id)

    async def _activity_uploaded(self, payload: WebhookPayload) -> None:
        await self.sync_fn(payload.athlete_id, payload.activity_id)

    async def _activity_analyzed(self, payload: WebhookPayload) -> None:
        if payload.activity_id:
            await self.repo.update_activity_analysis(
                payload.activity_id,
                payload.tss,
                payload.np,
                payload.icu_ctl,
            )

    async def _calendar_updated(self, payload: WebhookPayload) -> None:
        if not payload.athlete_id:
            return
        for event in payload.events:
            if _matches_client(payload.oauth_client_id, event):
                await self.repo.upsert_calendar_event(payload.athlete_id, event)
        for deleted in payload.deleted_events:
            if _matches_client(payload.oauth_client_id, deleted):
                await self.repo.delete_calendar_event(deleted)


def _matches_client(expected: str | None, event: CalendarEvent | DeletedEvent) -> bool:
    return not expected or not event.oauth_client_id or event.oauth_client_id == expected


def _load_sync_fn() -> SyncFn:
    async def noop(_athlete_id: str | None, _activity_id: str | None) -> None:
        return None

    try:
        module = import_module("application.activities.sync")
    except ModuleNotFoundError:
        return noop
    return getattr(module, "sync_activities_incremental", noop)
