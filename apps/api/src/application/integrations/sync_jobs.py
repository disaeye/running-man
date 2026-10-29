"""Durable sync jobs.

A triggered sync is one row in ``integration_sync_jobs``. The row, not an
in-process flag, is the state: it carries the window range, the per-window
progress counters, the heartbeat and the cancel request. ``execute_job`` runs
the phases in a worker thread, commits after every window and every few stream
downloads, and writes the terminal state itself — so a restart leaves a job the
startup sweep can fail with a reason, instead of a ``running`` flag that blocks
every later trigger.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from time import monotonic
from uuid import UUID

import anyio
from anyio.to_thread import run_sync as run_sync_in_worker_thread

from application.computation.queue_worker import enqueue_activity_recompute
from application.integrations.sync_job_details import finish_job_detail, running_detail
from application.integrations.sync_job_phases import SyncCancelledError, run_phases
from infrastructure.db.pool import get_sync_pool
from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.sync import sync_activity_streams
from infrastructure.repositories import sync_jobs
from infrastructure.repositories.integrations import UserIntegrationRepo

logger = logging.getLogger(__name__)


class StreamFetchError(Exception):
    """One activity's FIT download failed, reported back to the retry endpoint."""


@dataclass(frozen=True, slots=True)
class JobOutcome:
    status: str
    error: str | None
    detail: dict[str, object]


async def create_sync_job(
    athlete_id: UUID,
    source: str,
    kind: str,
    trigger: str,
    window_start: date | None = None,
    window_end: date | None = None,
) -> dict[str, object]:
    """Insert a queued job. Raises ``UniqueViolation`` when one is already active."""
    repo = sync_jobs.SyncJobRepo()
    return await repo.create(athlete_id, source, kind, trigger, window_start, window_end, 0)


async def retire_abandoned_jobs() -> int:
    """Fail every job left active by a previous process, at startup."""
    rows = await sync_jobs.SyncJobRepo().sweep_abandoned()
    if rows:
        logger.warning("启动清扫：%d 个同步任务被标记为中断", len(rows))
    return len(rows)


async def run_sync_job(
    job_id: UUID,
    athlete_id: UUID,
    source: str,
    credentials: dict[str, object],
) -> JobOutcome:
    """Run one job to a terminal state and mirror the result onto the integration row."""
    repo = UserIntegrationRepo()
    started_at = monotonic()
    await repo.update_sync_status(athlete_id, source, "running", None, running_detail(started_at))
    outcome = await run_sync_in_worker_thread(execute_job, job_id, credentials)
    await repo.update_sync_status(athlete_id, source, outcome.status, outcome.error, outcome.detail)
    return outcome


async def refetch_activity_streams(
    athlete_id: UUID, activity_id: str, credentials: dict[str, object]
) -> int:
    """Re-download one activity's streams, overwriting whatever is stored."""
    return await run_sync_in_worker_thread(
        _refetch_streams_sync, athlete_id, activity_id, credentials
    )


def _refetch_streams_sync(
    athlete_id: UUID, activity_id: str, credentials: dict[str, object]
) -> int:
    return anyio.run(_refetch_streams, athlete_id, activity_id, credentials)


async def _refetch_streams(
    athlete_id: UUID, activity_id: str, credentials: dict[str, object]
) -> int:
    with get_sync_pool().connection() as conn:
        async with IntervalsClient(
            api_key=str(credentials["api_key"]),
            athlete_id=str(credentials["athlete_id"]),
        ) as client:
            result = await sync_activity_streams(
                str(athlete_id), client, conn, [activity_id], force=True
            )
        if result.errors:
            conn.rollback()
            raise StreamFetchError(result.errors[0].message)
        conn.commit()
    return result.inserted


def execute_job(job_id: UUID, credentials: dict[str, object]) -> JobOutcome:
    """Synchronous entry point for the worker thread."""
    return anyio.run(_execute_job, job_id, credentials)


async def _execute_job(job_id: UUID, credentials: dict[str, object]) -> JobOutcome:
    with get_sync_pool().connection() as conn:
        job = sync_jobs.load_job(conn, job_id)
        started_at = monotonic()
        sync_jobs.mark_running(conn, job_id)
        conn.commit()
        errors: list[dict[str, object]] = []
        try:
            async with IntervalsClient(
                api_key=str(credentials["api_key"]),
                athlete_id=str(credentials["athlete_id"]),
            ) as client:
                await run_phases(conn, job, client, errors)
        except SyncCancelledError:
            conn.rollback()
            detail = finish_job_detail(conn, job_id, "cancelled", "已取消", errors, started_at)
            return JobOutcome(status="cancelled", error="已取消", detail=detail)
        except Exception as error:
            conn.rollback()
            message = f"{type(error).__name__}: {error}"
            logger.exception("同步任务失败 job=%s", job_id)
            detail = finish_job_detail(conn, job_id, "failed", message, errors, started_at)
            return JobOutcome(status="failed", error=message, detail=detail)
        detail = finish_job_detail(conn, job_id, "success", None, errors, started_at)
        outcome = JobOutcome(status="success", error=None, detail=detail)
    # Imported activities are inputs; the derived facts they feed do not exist
    # until something recomputes them. Nothing did: a fresh import left the
    # athlete with 20 activities and zero load facts until someone pressed the
    # recompute button by hand.
    await _enqueue_recompute(job)
    return outcome


async def _enqueue_recompute(job: dict[str, object]) -> None:
    athlete_id = job.get("athlete_id")
    if not isinstance(athlete_id, UUID):
        return
    try:
        await enqueue_activity_recompute(athlete_id, "sync")
    except Exception:
        logger.exception("同步完成后排队重算失败 athlete=%s", athlete_id)
