"""Final sync-job status and response details."""

from __future__ import annotations

from time import monotonic
from uuid import UUID

from psycopg import Connection

from infrastructure.repositories import sync_jobs

_EMPTY_COUNTS = dict.fromkeys(
    (
        "activities_upserted",
        "activities_deduped",
        "wellness_days",
        "streams_inserted",
        "ghosts_deleted",
    ),
    0,
)


def finish_job_detail(
    conn: Connection,
    job_id: UUID,
    status: str,
    error: str | None,
    errors: list[dict[str, object]],
    started_at: float,
) -> dict[str, object]:
    """Persist a terminal job state and return the saved summary."""
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    sync_jobs.finish_job(conn, job_id, status, error)
    conn.commit()
    row = sync_jobs.load_job(conn, job_id)
    return job_detail(row, started_at, status, error)


def job_detail(
    job: dict[str, object], started_at: float, status: str, error: str | None
) -> dict[str, object]:
    """The compact job status returned to the caller."""
    stage: dict[str, object] = {"name": "sync", "status": status}
    if error is not None:
        stage["error"] = error
    errors = job.get("errors")
    counts = {
        "activities_upserted": job["activities_upserted"],
        "activities_deduped": job["activities_deduplicated"],
        "wellness_days": job["wellness_days"],
        "streams_inserted": job["streams_inserted"],
        "ghosts_deleted": job["ghosts_deleted"],
    }
    return {
        "counts": counts,
        "duration_ms": int((monotonic() - started_at) * 1000),
        "stages": [stage],
        "errors": errors if isinstance(errors, list) else [],
        "job_id": str(job["id"]),
    }


def running_detail(started_at: float) -> dict[str, object]:
    """Initial status before any work has completed."""
    return {
        "counts": dict(_EMPTY_COUNTS),
        "duration_ms": int((monotonic() - started_at) * 1000),
        "stages": [{"name": "sync", "status": "running"}],
        "errors": [],
    }
