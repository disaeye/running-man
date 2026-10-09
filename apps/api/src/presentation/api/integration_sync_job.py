from __future__ import annotations

from time import monotonic
from uuid import UUID

from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.integrations import UserIntegrationRepo
from presentation.api.integration_helpers import sync
from presentation.api.integration_sync_detail import (
    IntegrationSyncResult,
    empty_sync_result,
    sync_detail,
)


async def run_sync_job(
    source: str,
    athlete_id: UUID,
    credentials_data: dict[str, object],
    started_at: float,
) -> None:
    repo = UserIntegrationRepo()
    try:
        result = _sync_result(await sync(source, athlete_id, credentials_data))
    except Exception as error:
        msg = f"{type(error).__name__}: {error}"
        detail = sync_detail(empty_sync_result(), started_at, "failed", msg)
        await _update(repo, athlete_id, source, "failed", msg, detail)
        return
    detail = sync_detail(result, started_at, "success", None)
    await _update(repo, athlete_id, source, "success", None, detail)


def _sync_result(result: ActivitySyncStats | IntegrationSyncResult) -> IntegrationSyncResult:
    if isinstance(result, IntegrationSyncResult):
        return result
    return IntegrationSyncResult(activity_stats=result)


async def _update(
    repo: UserIntegrationRepo,
    athlete_id: UUID,
    source: str,
    status: str,
    error: str | None,
    detail: dict[str, object],
) -> None:
    _ = await repo.update_sync_status(athlete_id, source, status, error, detail)


def sync_started_at() -> float:
    return monotonic()
