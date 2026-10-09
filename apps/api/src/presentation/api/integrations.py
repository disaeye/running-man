from inspect import signature
from time import monotonic
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status

from application.data_health import compute_data_health
from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.integrations import UserIntegrationRepo
from presentation.api.integration_contracts import (
    ConnectIntegrationRequest,
    IntegrationResponse,
    IntegrationSettingsUpdate,
    IntegrationSyncResponse,
)
from presentation.api.integration_helpers import (
    credentials,
    decrypt_credentials,
    public_integration,
)
from presentation.api.integration_sync_detail import empty_sync_result, sync_detail
from presentation.api.integration_sync_job import run_sync_job
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/integrations", tags=["integrations"])
SOURCES = {"intervals_icu"}


def get_integration_repo() -> UserIntegrationRepo:
    return UserIntegrationRepo()


def get_integrations_pool() -> Any:
    return get_pool()


AthleteDep = Annotated[Athlete, Depends(get_current_athlete)]
RepoDep = Annotated[UserIntegrationRepo, Depends(get_integration_repo)]
PoolDep = Annotated[Any, Depends(get_integrations_pool)]


@router.get("", response_model=list[IntegrationResponse])
async def list_integrations(
    athlete: AthleteDep,
    repo: RepoDep,
    db_pool: PoolDep,
) -> list[IntegrationResponse]:
    health = await _data_health(athlete.id, db_pool)
    return [
        IntegrationResponse.model_validate(public_integration(row, health))
        for row in await repo.list(athlete.id)
    ]


@router.get("/{source}", response_model=IntegrationResponse)
async def get_integration(
    source: str,
    athlete: AthleteDep,
    repo: RepoDep,
    db_pool: PoolDep,
) -> IntegrationResponse:
    _validate_source(source)
    row = await repo.get(athlete.id, source)
    if row is None:
        return IntegrationResponse(source=source, connected=False, staleness_bucket="missing")
    health = await _data_health(athlete.id, db_pool)
    return IntegrationResponse.model_validate(public_integration(row, health))


@router.put("/{source}/connect", response_model=IntegrationResponse)
async def connect_integration(
    source: str,
    payload: ConnectIntegrationRequest,
    athlete: AthleteDep,
    repo: RepoDep,
) -> IntegrationResponse:
    _validate_source(source)
    integration_credentials = await credentials(source, payload)
    row = await repo.upsert(
        athlete.id,
        source,
        {"connected": True, "credentials": {"ciphertext": encrypt(integration_credentials)}},
    )
    return IntegrationResponse.model_validate(public_integration(row))


@router.delete("/{source}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    source: str,
    athlete: AthleteDep,
    repo: RepoDep,
) -> Response:
    _validate_source(source)
    if not await repo.delete(athlete.id, source):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="integration not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{source}/sync", response_model=IntegrationSyncResponse)
async def sync_integration(
    source: str,
    athlete: AthleteDep,
    repo: RepoDep,
    background_tasks: BackgroundTasks,
) -> IntegrationSyncResponse:
    _validate_source(source)
    row = await repo.get(athlete.id, source)
    if row is None or not row.get("connected"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="integration not connected"
        )
    if row.get("last_sync_status") == "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="sync already running"
        )
    credentials_data = decrypt_credentials(row)
    started_at = monotonic()
    running_detail = sync_detail(empty_sync_result(), started_at, "running", None)
    await _update_sync_status(repo, athlete.id, source, "running", None, running_detail)
    background_tasks.add_task(
        run_sync_job, source, athlete.id, credentials_data, started_at
    )
    return IntegrationSyncResponse(
        source=source,
        upserted=0,
        deduplicated=0,
        total_processed=0,
        status="accepted",
    )


@router.put("/{source}/settings", response_model=IntegrationResponse)
async def update_settings(
    source: str,
    payload: IntegrationSettingsUpdate,
    athlete: AthleteDep,
    repo: RepoDep,
) -> IntegrationResponse:
    _validate_source(source)
    row = await repo.get(athlete.id, source)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="integration not found")
    raw_settings = row.get("settings")
    stored_settings = (
        cast(dict[str, object], raw_settings) if isinstance(raw_settings, dict) else {}
    )
    next_settings: dict[str, object] = stored_settings | payload.model_dump(exclude_none=True)
    updated = await repo.upsert(
        athlete.id,
        source,
        {
            "connected": row.get("connected", False),
            "credentials": row.get("credentials"),
            "settings": next_settings,
        },
    )
    return IntegrationResponse.model_validate(public_integration(updated))





async def _update_sync_status(
    repo: UserIntegrationRepo,
    athlete_id: UUID,
    source: str,
    sync_status: str,
    error: str | None,
    detail: dict[str, object],
) -> None:
    params = signature(repo.update_sync_status).parameters
    if len(params) >= 5:
        _ = await repo.update_sync_status(athlete_id, source, sync_status, error, detail)
        return
    _ = await repo.update_sync_status(athlete_id, source, sync_status, error)


async def _data_health(athlete_id: UUID, db_pool: Any) -> dict[str, object] | None:
    if db_pool is None or getattr(db_pool, "closed", False):
        return None
    return await compute_data_health(athlete_id, db_pool)


def _validate_source(source: str) -> None:
    if source not in SOURCES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="source not found")
