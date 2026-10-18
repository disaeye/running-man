from datetime import date
from typing import Annotated, Any, cast
from uuid import UUID

import psycopg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status

from application.data_health import compute_data_health
from application.integrations.sync_jobs import (
    create_sync_job,
    run_sync_job,
)
from domain.integrations.crypto import encrypt
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.integrations import UserIntegrationRepo
from infrastructure.repositories.sync_jobs import SyncJobRepo
from presentation.api.activity_bulk_delete import clear_activities
from presentation.api.integration_contracts import (
    BackfillRequest,
    ConnectIntegrationRequest,
    IntegrationResponse,
    IntegrationSettingsUpdate,
    SourceCoverageResponse,
    SyncJobResponse,
)
from presentation.api.integration_helpers import (
    credentials,
    decrypt_credentials,
    public_integration,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/integrations", tags=["integrations"])
SOURCES = {"intervals_icu"}

ACTIVE_JOB_CONFLICT = "已有同步任务正在运行，请等待完成或先取消"


def get_integration_repo() -> UserIntegrationRepo:
    return UserIntegrationRepo()


def get_integrations_pool() -> Any:
    return get_pool()


def get_sync_job_repo() -> SyncJobRepo:
    return SyncJobRepo()


def get_activity_repo() -> ActivityRepo:
    return ActivityRepo()


AthleteDep = Annotated[Athlete, Depends(get_current_athlete)]
RepoDep = Annotated[UserIntegrationRepo, Depends(get_integration_repo)]
PoolDep = Annotated[Any, Depends(get_integrations_pool)]
JobRepoDep = Annotated[SyncJobRepo, Depends(get_sync_job_repo)]
ActivityRepoDep = Annotated[ActivityRepo, Depends(get_activity_repo)]


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
    activity_repo: ActivityRepoDep,
    clear_data: bool = False,
) -> Response:
    """Drop the connection, optionally deleting everything already imported."""
    _validate_source(source)
    if clear_data:
        _ = await clear_activities(athlete.id, activity_repo, repo, source)
    if not await repo.delete(athlete.id, source):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="integration not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{source}/sync", response_model=SyncJobResponse)
async def sync_integration(
    source: str,
    athlete: AthleteDep,
    repo: RepoDep,
    job_repo: JobRepoDep,
    background_tasks: BackgroundTasks,
) -> SyncJobResponse:
    """Queue an incremental sync and return the job the UI polls for progress."""
    _validate_source(source)
    row = await _connected_row(repo, athlete.id, source)
    credentials_data = decrypt_credentials(row)
    job = await _queue_job(athlete.id, source, "incremental", "manual", job_repo)
    background_tasks.add_task(
        run_sync_job, cast(UUID, job["id"]), athlete.id, source, credentials_data
    )
    return SyncJobResponse.model_validate(job)


@router.post("/{source}/backfill", response_model=SyncJobResponse)
async def backfill_integration(
    source: str,
    payload: BackfillRequest,
    athlete: AthleteDep,
    repo: RepoDep,
    job_repo: JobRepoDep,
    background_tasks: BackgroundTasks,
) -> SyncJobResponse:
    """Import history from ``from_date`` to today, one calendar month per window."""
    _validate_source(source)
    row = await _connected_row(repo, athlete.id, source)
    today = today_in_zone(athlete.timezone)
    if payload.from_date > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_date 不能晚于今天",
        )
    credentials_data = decrypt_credentials(row)
    job = await _queue_job(
        athlete.id, source, "backfill", "manual", job_repo, payload.from_date, today
    )
    background_tasks.add_task(
        run_sync_job, cast(UUID, job["id"]), athlete.id, source, credentials_data
    )
    return SyncJobResponse.model_validate(job)


@router.get("/{source}/jobs/current", response_model=SyncJobResponse | None)
async def current_sync_job(
    source: str,
    athlete: AthleteDep,
    job_repo: JobRepoDep,
) -> SyncJobResponse | None:
    """Latest job for this source, running or finished."""
    _validate_source(source)
    _ = await job_repo.sweep_stale(athlete.id, source)
    row = await job_repo.get_current(athlete.id, source)
    return None if row is None else SyncJobResponse.model_validate(row)


@router.post("/{source}/jobs/{job_id}/cancel", response_model=SyncJobResponse)
async def cancel_sync_job(
    source: str,
    job_id: UUID,
    athlete: AthleteDep,
    job_repo: JobRepoDep,
) -> SyncJobResponse:
    """Ask a running job to stop; the runner honours it at the next phase boundary."""
    _validate_source(source)
    row = await job_repo.request_cancel(athlete.id, job_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="没有可取消的同步任务"
        )
    return SyncJobResponse.model_validate(row)


@router.get("/{source}/coverage", response_model=SourceCoverageResponse)
async def source_coverage(
    source: str, athlete: AthleteDep, activity_repo: ActivityRepoDep
) -> SourceCoverageResponse:
    """Imported date range for this source, so the athlete can see the boundary."""
    _validate_source(source)
    row = await activity_repo.data_range(athlete.id, source)
    first_day, last_day = row.get("first_day"), row.get("last_day")
    return SourceCoverageResponse(
        source=source,
        first_activity_date=first_day if isinstance(first_day, date) else None,
        last_activity_date=last_day if isinstance(last_day, date) else None,
        activity_count=int(cast(int, row.get("total") or 0)),
    )


async def _connected_row(
    repo: UserIntegrationRepo, athlete_id: UUID, source: str
) -> dict[str, object]:
    row = await repo.get(athlete_id, source)
    if row is None or not row.get("connected"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="integration not connected"
        )
    return row


async def _queue_job(
    athlete_id: UUID,
    source: str,
    kind: str,
    trigger: str,
    job_repo: SyncJobRepo,
    window_start: date | None = None,
    window_end: date | None = None,
) -> dict[str, object]:
    _ = await job_repo.sweep_stale(athlete_id, source)
    if await job_repo.active(athlete_id, source) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACTIVE_JOB_CONFLICT)
    try:
        return await create_sync_job(
            athlete_id, source, kind, trigger, window_start, window_end
        )
    except psycopg.errors.UniqueViolation as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=ACTIVE_JOB_CONFLICT
        ) from error

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


async def _data_health(athlete_id: UUID, db_pool: Any) -> dict[str, object] | None:
    if db_pool is None or getattr(db_pool, "closed", False):
        return None
    return await compute_data_health(athlete_id, db_pool)


def _validate_source(source: str) -> None:
    if source not in SOURCES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="source not found")
