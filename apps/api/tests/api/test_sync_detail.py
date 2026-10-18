"""What a finished job writes onto the integration row.

The job row is the source of truth for progress; ``user_integrations`` keeps a
denormalized copy so the source card and the staleness badge keep working. These
tests pin that copy: a running marker with empty counts first, then the terminal
status with the job's accumulated numbers.

The executor itself is faked here — its own behaviour is covered by
``tests/integration/test_sync_jobs.py``.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from application.integrations import sync_jobs as execution
from application.integrations.sync_jobs import JobOutcome
from infrastructure.auth.models import Athlete

ATHLETE = Athlete(uuid4(), "sync-detail2@example.com", "hash")
JOB_ID = uuid4()

pytestmark = pytest.mark.no_db


class _StatusRepo:
    """Records every ``update_sync_status`` call in order."""

    def __init__(self) -> None:
        self.status_calls: list[tuple[UUID, str, str, str | None, dict[str, object] | None]] = []

    async def update_sync_status(
        self,
        athlete_id: UUID,
        source: str,
        status: str,
        error: str | None,
        detail: dict[str, object] | None = None,
    ) -> None:
        self.status_calls.append((athlete_id, source, status, error, detail))


def _detail(**counts: int) -> dict[str, object]:
    return {
        "counts": {
            "activities_upserted": counts.get("upserted", 0),
            "activities_deduped": counts.get("deduplicated", 0),
            "wellness_days": counts.get("wellness", 0),
            "streams_inserted": counts.get("streams", 0),
            "ghosts_deleted": counts.get("ghosts", 0),
        },
        "duration_ms": 1200,
        "stages": [{"name": "sync", "status": counts.get("status", "success")}],
        "errors": [],
        "job_id": str(JOB_ID),
    }


def _prepare(monkeypatch: pytest.MonkeyPatch, outcome: JobOutcome) -> _StatusRepo:
    repo = _StatusRepo()
    monkeypatch.setattr(execution, "UserIntegrationRepo", lambda: repo)
    monkeypatch.setattr(execution, "execute_job", lambda _job_id, _credentials: outcome)
    return repo


async def test_running_marker_is_written_before_the_job_starts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = _prepare(
        monkeypatch, JobOutcome("success", None, _detail(upserted=3, status="success"))
    )

    await execution.run_sync_job(JOB_ID, ATHLETE.id, "intervals_icu", {"api_key": "k"})

    assert len(repo.status_calls) == 2
    running, finished = repo.status_calls
    assert running[:4] == (ATHLETE.id, "intervals_icu", "running", None)
    assert running[4] is not None
    assert running[4]["counts"] == {
        "activities_upserted": 0,
        "activities_deduped": 0,
        "wellness_days": 0,
        "streams_inserted": 0,
        "ghosts_deleted": 0,
    }
    assert running[4]["stages"] == [{"name": "sync", "status": "running"}]
    assert finished[:4] == (ATHLETE.id, "intervals_icu", "success", None)
    assert finished[4] is not None
    assert finished[4]["counts"]["activities_upserted"] == 3


async def test_failure_writes_the_reason_and_the_failed_stage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = _prepare(
        monkeypatch,
        JobOutcome(
            "failed",
            "ValueError: API rate limit exceeded",
            _detail(status="failed"),
        ),
    )

    await execution.run_sync_job(JOB_ID, ATHLETE.id, "intervals_icu", {"api_key": "k"})

    _athlete_id, source, status, error, detail = repo.status_calls[-1]
    assert source == "intervals_icu"
    assert status == "failed"
    assert error is not None and "rate limit" in error.lower()
    assert detail is not None
    assert detail["stages"] == [{"name": "sync", "status": "failed"}]


async def test_cancel_is_reported_as_cancelled_not_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = _prepare(
        monkeypatch, JobOutcome("cancelled", "已取消", _detail(status="cancelled"))
    )

    await execution.run_sync_job(JOB_ID, ATHLETE.id, "intervals_icu", {"api_key": "k"})

    assert repo.status_calls[-1][2] == "cancelled"


async def test_terminal_detail_carries_the_job_id_for_the_retry_ui(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = _prepare(monkeypatch, JobOutcome("success", None, _detail()))

    await execution.run_sync_job(JOB_ID, ATHLETE.id, "intervals_icu", {"api_key": "k"})

    detail = repo.status_calls[-1][4]
    assert detail is not None
    assert detail["job_id"] == str(JOB_ID)
    assert isinstance(detail["duration_ms"], int)
