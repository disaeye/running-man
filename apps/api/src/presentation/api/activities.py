from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status

from infrastructure.auth.models import Athlete
from infrastructure.parsing.models import FitSample
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.integrations import UserIntegrationRepo
from infrastructure.repositories.upload_provenance import finish_upload_run, start_upload_run
from presentation.api._upload_helpers import (
    file_type,
    parse_upload,
    streams_from_samples,
    summary_from_samples,
)
from presentation.api.activity_bulk_delete import clear_activities
from presentation.api.activity_export import export_activity as export_activity_response
from presentation.api.activity_read import (
    get_activity as read_activity,
)
from presentation.api.activity_read import (
    get_laps as read_laps,
)
from presentation.api.activity_read import (
    get_streams as read_streams,
)
from presentation.api.activity_read import (
    list_activities as read_activities,
)
from presentation.api.schemas import (
    ActivityDetail,
    ActivitySummary,
    ActivityUploadResponse,
    LapResponse,
)
from presentation.api.schemas_core import (
    BatchUploadItem,
    BatchUploadResponse,
    BulkDeleteResponse,
)
from presentation.api.schemas_stream import StreamPoint
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/activities", tags=["activities"])

BATCH_MAX_FILES = 20
BATCH_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB per file


def get_activity_repo() -> ActivityRepo:
    return ActivityRepo()


def get_integration_repo() -> UserIntegrationRepo:
    return UserIntegrationRepo()


@router.post(
    "/upload",
    response_model=ActivityUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_activity(
    file: UploadFile = File(...),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> ActivityUploadResponse:
    data = await file.read()
    ftype = file_type(file.filename)
    run_id = await start_upload_run(athlete.id, files=1)
    try:
        samples, metadata, laps = parse_upload(data, ftype)
        if not samples:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="activity file has no samples"
            )
        summary = summary_from_samples(samples, ftype, file.filename, metadata)
        streams = streams_from_samples(samples)
        row = await repo.upsert_upload(athlete.id, summary, streams)
        deduplicated = bool(row.get("deduplicated"))
        if laps and not deduplicated:
            await repo.upsert_laps(athlete.id, str(row["activity_id"]), laps)
        activity = ActivitySummary.model_validate(row)
        job_generation = await _recompute_after_upload(athlete.id)
    except Exception as error:
        await finish_upload_run(
            run_id,
            status="failed",
            activities_seen=1,
            activities_upserted=0,
            activities_deduplicated=0,
            errors_count=1,
            error_summary=str(error),
        )
        raise
    await finish_upload_run(
        run_id,
        status="success",
        activities_seen=1,
        activities_upserted=0 if deduplicated else 1,
        activities_deduplicated=1 if deduplicated else 0,
        errors_count=0,
        streams_inserted=len(streams),
    )
    return ActivityUploadResponse(
        **activity.model_dump(),
        recompute_status="queued",
        recompute_generation=job_generation,
    )


@router.post(
    "/batch-upload",
    response_model=BatchUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def batch_upload_activities(
    files: list[UploadFile] = File(...),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> BatchUploadResponse:
    """Upload up to 20 files; failures are isolated per file and dedup yields
    ``status: "duplicate"`` rather than an error."""
    if len(files) > BATCH_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"too many files: maximum {BATCH_MAX_FILES} per batch",
        )

    run_id = await start_upload_run(athlete.id, files=len(files))
    results = [await _process_one(upload, athlete.id, repo) for upload in files]
    failed = sum(1 for r in results if r.status == "failed")
    duplicates = sum(1 for r in results if r.status == "duplicate")
    succeeded = sum(1 for r in results if r.status == "success")
    if any(r.status == "success" for r in results):
        generation = await _recompute_after_upload(athlete.id)
    else:
        generation = None
    error_messages = [f"{r.filename}: {r.error}" for r in results if r.status == "failed"]
    await finish_upload_run(
        run_id,
        status="failed" if failed and not succeeded else "success",
        activities_seen=len(files),
        activities_upserted=succeeded,
        activities_deduplicated=duplicates,
        errors_count=failed,
        error_summary="; ".join(error_messages) if error_messages else None,
    )
    return BatchUploadResponse(
        results=results,
        recompute_status="queued" if generation is not None else None,
        recompute_generation=generation,
    )


async def _process_one(
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


async def _recompute_after_upload(athlete_id: UUID) -> int:
    """Recompute load + PMC facts after upload; mirrors sync/delete paths."""
    from application.computation.orchestration import enqueue_activity_recompute

    return await enqueue_activity_recompute(athlete_id, "upload")


class _BatchError(Exception):
    """Internal control-flow signal for per-file failures during batch upload."""


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
        raise _BatchError(f"parse error: {exc}") from exc
    if not samples:
        raise _BatchError("activity file has no samples")
    return samples, metadata, ftype, laps


@router.get("", response_model=list[ActivitySummary])
async def list_activities(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> list[ActivitySummary]:
    return await read_activities(start, end, athlete, repo)


@router.get("/{activity_id}", response_model=ActivityDetail)
async def get_activity(
    activity_id: str,
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> ActivityDetail:
    return await read_activity(activity_id, athlete, repo)


@router.get("/{activity_id}/streams", response_model=list[StreamPoint])
async def get_streams(
    activity_id: str,
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> list[StreamPoint]:
    return await read_streams(activity_id, athlete, repo)


@router.get("/{activity_id}/laps", response_model=list[LapResponse])
async def get_laps(
    activity_id: str,
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> list[LapResponse]:
    return await read_laps(activity_id, athlete, repo)


@router.get(
    "/{activity_id}/export", response_class=Response,
    responses={200: {"content": {
        "application/vnd.ant.fit": {"schema": {"format": "binary", "type": "string"}},
        "application/xml": {"schema": {"format": "binary", "type": "string"}},
    }}},
)
async def export_activity(
    activity_id: str,
    format: str = Query(..., description="One of: fit, tcx"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> Response:
    return await export_activity_response(activity_id, format, athlete, repo)


@router.delete("", response_model=BulkDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_activities_bulk(
    source: str | None = Query(default=None),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
    integrations: UserIntegrationRepo = Depends(get_integration_repo),
) -> BulkDeleteResponse:
    generation = await clear_activities(athlete.id, repo, integrations, source)
    return BulkDeleteResponse(
        status="ok",
        recompute_status="queued",
        recompute_generation=generation,
    )
