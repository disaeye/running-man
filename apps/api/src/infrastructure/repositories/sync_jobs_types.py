"""Data classes for sync job progress reporting."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID


@dataclass(frozen=True, slots=True)
class JobProgress:
    """One progress step for a running job.

    Counters are deltas; ``phase``, ``windows_done`` and ``windows_total`` are
    absolute and left untouched when ``None``.
    """

    phase: str | None = None
    windows_done: int | None = None
    windows_total: int | None = None
    activities_seen: int = 0
    activities_upserted: int = 0
    activities_deduplicated: int = 0
    streams_inserted: int = 0
    wellness_days: int = 0
    ghosts_deleted: int = 0
    errors_count: int = 0


def job_id_of(job: dict[str, object]) -> UUID:
    return UUID(str(job["id"]))


def athlete_id_of(job: dict[str, object]) -> str:
    return str(job["athlete_id"])


def job_window_start(job: dict[str, object]) -> date:
    if isinstance(val := job.get("window_start"), date):
        return val
    raise ValueError("job has no window_start")


def job_window_end(job: dict[str, object]) -> date:
    if isinstance(val := job.get("window_end"), date):
        return val
    raise ValueError("job has no window_end")
