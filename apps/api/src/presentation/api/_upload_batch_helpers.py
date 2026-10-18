"""Batch-upload processing helpers for activities router."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, UploadFile

from application.computation import orchestration
from infrastructure.parsing.models import FitSample
from infrastructure.repositories.activity import ActivityRepo
from presentation.api._upload_helpers import (
    file_type,
    parse_upload,
    streams_from_samples,
    summary_from_samples,
)
from presentation.api.schemas_core import BatchUploadItem

BATCH_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB per file


class _BatchError(Exception):
    """Internal control-flow signal for per-file failures during batch upload."""


async def process_one_upload(
    upload: UploadFile, athlete_id: UUID, repo: ActivityRepo
) -> BatchUploadItem:
    filename = upload.filename or "unknown"
    try:
        result = await _attempt_upload(upload, athlete_id, repo)
    except _BatchError as failure:
        return BatchUploadItem(filename=filename, status="failed", error=str(failure))
    return BatchUploadItem(
        filename=filename, status=str(result["status"]), activity_id=str(result["activity_id"])
    )


async def _attempt_upload(
    upload: UploadFile, athlete_id: UUID, repo: ActivityRepo
) -> dict[str, object]:
    try:
        data = await upload.read()
    except Exception as exc:
        raise _BatchError(f"read error: {exc}") from exc
    samples, metadata, ftype, laps = _parse_one(filename=upload.filename or "unknown", data=data)
    summary = summary_from_samples(samples, ftype, upload.filename, metadata)
    streams = streams_from_samples(samples)
    try:
        row = await repo.upsert_upload(athlete_id, summary, streams)
    except Exception as exc:
        raise _BatchError(f"store error: {exc}") from exc
    if bool(row.get("deduplicated")):
        return {"status": "duplicate", "activity_id": str(row["activity_id"])}
    if laps:
        await repo.upsert_laps(athlete_id, str(row["activity_id"]), laps)
    return {"status": "success", "activity_id": str(row["activity_id"])}


async def recompute_after_upload(athlete_id: UUID) -> int:
    """Recompute load + PMC facts after upload; mirrors sync/delete paths."""
    return await orchestration.enqueue_activity_recompute(athlete_id, "upload")


def _parse_one(
    filename: str, data: bytes
) -> tuple[list[FitSample], dict[str, object], str, list[dict[str, object]]]:
    if len(data) > BATCH_MAX_FILE_BYTES:
        raise _BatchError(f"file exceeds {BATCH_MAX_FILE_BYTES} byte limit")
    try:
        ftype = file_type(filename)
        samples, metadata, laps = parse_upload(data, ftype)
    except HTTPException as exc:
        raise _BatchError(str(exc.detail)) from exc
    except Exception as exc:
        raise _BatchError(f"corrupt file: {exc}") from exc
    if not samples:
        raise _BatchError("activity file has no samples")
    return samples, metadata, ftype, laps
