"""Tests for ``POST /api/activities/batch-upload``.

Covers the contract documented in the task spec:
- Multiple-file success path
- Idempotent deduplication (same file twice → first success, second duplicate)
- Partial failure (mixed valid + invalid files in one batch)
- Hard limits (>20 files → 400; per-file >50 MB → individual failed result)
- Each result carries {filename, status, activity_id?, error?} shape
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import BATCH_MAX_FILE_BYTES, BATCH_MAX_FILES, get_activity_repo
from presentation.auth.deps import get_current_athlete
from tests.factories.fit_generator import generate_fit_stream
from tests.factories.tcx_generator import generate_tcx_bytes

ATHLETE = Athlete(uuid4(), "batch@example.com", "hash")


@pytest.fixture(autouse=True)
def _patch_recompute() -> Any:
    """Keep the post-upload fact recompute and provenance writes out of these
    no_db unit tests.

    Mirrors tests/api/test_activities_endpoints.py; the real recompute and the
    upload-run recorder open the DB pool, which is not configured here.
    """
    with (
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=1,
        ),
        patch(
            "presentation.api.activities.start_upload_run",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        yield


@dataclass
class _UploadCall:
    athlete_id: UUID
    summary: dict[str, object]
    streams: Sequence[dict[str, object]]


class _RecordingRepo:
    """Fake that records every upsert call.

    Returns ``deduplicated=True`` if the activity_id has been seen before,
    mirroring the real SQL upsert's source-hash dedup behavior.
    """

    def __init__(self) -> None:
        self.calls: list[_UploadCall] = []
        self.lap_calls: list[tuple[UUID, str, Sequence[dict[str, object]]]] = []
        self.seen_ids: set[str] = set()

    async def upsert_upload(
        self,
        athlete_id: UUID,
        summary: dict[str, object],
        streams: Sequence[dict[str, object]],
    ) -> dict[str, object]:
        self.calls.append(_UploadCall(athlete_id, summary, streams))
        activity_id = str(summary["activity_id"])
        dedup = activity_id in self.seen_ids
        self.seen_ids.add(activity_id)
        return {"activity_id": activity_id, "deduplicated": dedup}

    async def upsert_laps(
        self,
        athlete_id: UUID,
        activity_id: str,
        laps: Sequence[dict[str, object]],
    ) -> None:
        self.lap_calls.append((athlete_id, activity_id, laps))


@pytest.mark.no_db
async def test_batch_upload_single_success() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(("ride-2026.fit", generate_fit_stream(duration_seconds=3)))

    response = await _post_batch(files)

    assert response.status_code == 201
    assert response.json()["recompute_status"] == "queued"
    assert response.json()["recompute_generation"] == 1
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["filename"] == "ride-2026.fit"
    assert results[0]["status"] == "success"
    assert "activity_id" in results[0]
    assert results[0].get("error") is None
    assert len(repo.calls) == 1


@pytest.mark.no_db
async def test_batch_upload_multiple_files_all_success() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(
        ("a.fit", generate_fit_stream(duration_seconds=2, hr=140)),
        ("b.tcx", generate_tcx_bytes(duration_seconds=2, hr=150)),
        ("c.fit", generate_fit_stream(duration_seconds=4, hr=160)),
    )

    response = await _post_batch(files)

    assert response.status_code == 201
    results = response.json()["results"]
    assert [r["status"] for r in results] == ["success", "success", "success"]
    assert len(repo.calls) == 3


@pytest.mark.no_db
async def test_batch_upload_same_file_twice_yields_duplicate() -> None:
    _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    payload = generate_fit_stream(duration_seconds=3)
    files = _files(("dup.fit", payload), ("dup.fit", payload))

    response = await _post_batch(files)

    assert response.status_code == 201
    statuses = [r["status"] for r in response.json()["results"]]
    assert statuses == ["success", "duplicate"]


@pytest.mark.no_db
async def test_batch_upload_unsupported_extension_is_failed_not_400() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(
        ("good.fit", generate_fit_stream(duration_seconds=2)),
        ("bad.pdf", b"%PDF-1.4 fake pdf bytes"),
    )

    response = await _post_batch(files)

    assert response.status_code == 201
    results = response.json()["results"]
    assert results[0]["status"] == "success"
    assert results[1]["status"] == "failed"
    assert "error" in results[1]
    assert len(repo.calls) == 1, "bad file must not be persisted"


@pytest.mark.no_db
async def test_batch_upload_corrupt_fit_is_failed() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(("corrupt.fit", b"not actually a fit file"))

    response = await _post_batch(files)

    assert response.status_code == 201
    result = response.json()["results"][0]
    assert result["status"] == "failed"
    assert "error" in result
    assert repo.calls == []


@pytest.mark.no_db
async def test_batch_upload_zero_duration_tcx_is_failed() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(("empty.tcx", generate_tcx_bytes(duration_seconds=0)))

    response = await _post_batch(files)

    assert response.status_code == 201
    result = response.json()["results"][0]
    assert result["status"] == "failed"
    assert "no samples" in result["error"]
    assert repo.calls == []


@pytest.mark.no_db
async def test_batch_upload_too_many_files_returns_400() -> None:
    _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    too_many = BATCH_MAX_FILES + 1
    files = _files(
        *((f"f{i}.fit", generate_fit_stream(duration_seconds=1)) for i in range(too_many))
    )

    response = await _post_batch(files)

    assert response.status_code == 400
    assert "maximum" in response.json()["detail"]


@pytest.mark.no_db
async def test_batch_upload_oversize_file_is_failed_result() -> None:
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    oversize = b"\x00" * (BATCH_MAX_FILE_BYTES + 1)
    files = _files(("huge.fit", oversize))

    response = await _post_batch(files)

    assert response.status_code == 201, "oversize is per-file failure, not batch 400"
    result = response.json()["results"][0]
    assert result["status"] == "failed"
    assert "exceeds" in result["error"]
    assert repo.calls == []


@pytest.mark.no_db
async def test_batch_upload_result_shape_preserves_filename_order() -> None:
    _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(
        ("first.fit", generate_fit_stream(duration_seconds=2)),
        ("second.tcx", generate_tcx_bytes(duration_seconds=2)),
    )

    response = await _post_batch(files)

    assert response.status_code == 201
    filenames = [r["filename"] for r in response.json()["results"]]
    assert filenames == ["first.fit", "second.tcx"]


@pytest.mark.no_db
async def test_batch_upload_partial_failure_does_not_abort_others() -> None:
    """Three files: one good, one corrupt, one good. Both good ones persist."""
    repo = _use_athlete_and_repo(ATHLETE, _RecordingRepo())
    files = _files(
        ("good1.fit", generate_fit_stream(duration_seconds=2)),
        ("bad.fit", b"corrupt"),
        ("good2.tcx", generate_tcx_bytes(duration_seconds=2)),
    )

    response = await _post_batch(files)

    assert response.status_code == 201
    statuses = [r["status"] for r in response.json()["results"]]
    assert statuses == ["success", "failed", "success"]
    assert len(repo.calls) == 2, "only the two valid files reach the repo"


@pytest.mark.no_db
async def test_batch_upload_db_error_does_not_abort_batch() -> None:
    """If upsert_upload raises, that file is marked failed but the rest proceed."""

    class _FailingRepo(_RecordingRepo):
        async def upsert_upload(self, athlete_id, summary, streams):  # type: ignore[override]
            if summary["file_type"] == "fit":
                raise RuntimeError("simulated DB connection lost")
            return await super().upsert_upload(athlete_id, summary, streams)

    _use_athlete_and_repo(ATHLETE, _FailingRepo())
    files = _files(
        ("boom.fit", generate_fit_stream(duration_seconds=2)),
        ("ok.tcx", generate_tcx_bytes(duration_seconds=2)),
    )

    response = await _post_batch(files)

    assert response.status_code == 201
    statuses = [r["status"] for r in response.json()["results"]]
    assert statuses == ["failed", "success"]
    assert "store error" in response.json()["results"][0]["error"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _use_athlete_and_repo(athlete: Athlete, repo: _RecordingRepo) -> _RecordingRepo:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    app.dependency_overrides[get_activity_repo] = lambda: repo
    return repo


def _files(*name_payload: tuple[str, bytes]) -> list[tuple[str, tuple[str, bytes], str]]:
    return [
        ("files", (name, payload, "application/octet-stream")) for name, payload in name_payload
    ]


async def _post_batch(files: list[Any]) -> Any:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/v1/activities/batch-upload", files=files)


# Silence "unused import" — kept for future tests asserting timestamp shape.
_ = (datetime, timedelta, UTC)
