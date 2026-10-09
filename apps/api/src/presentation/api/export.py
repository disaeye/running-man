import csv
from datetime import UTC, date, datetime
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.encoders import jsonable_encoder

from infrastructure.auth.models import Athlete
from infrastructure.repositories.account import AccountRepo
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.calendar import CalendarRepo
from presentation.api.account_contracts import (
    AccountExportDocument,
    AccountExportManifestResponse,
    AccountExportResourceManifest,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/export", tags=["export"])


def get_activity_repo() -> ActivityRepo:
    return ActivityRepo()


def get_calendar_repo() -> CalendarRepo:
    return CalendarRepo()


def get_account_repo() -> AccountRepo:
    return AccountRepo()


@router.get(
    "/activities.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
)
async def activities_csv(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: ActivityRepo = Depends(get_activity_repo),
) -> Response:
    rows = await repo.list_by_range(athlete.id, start, end)
    buffer = StringIO()
    fieldnames = list(rows[0]) if rows else ["activity_id", "start_time", "sport", "tss"]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return Response(buffer.getvalue(), media_type="text/csv")


@router.get("", response_model=AccountExportManifestResponse)
async def account_export_manifest(
    request: Request,
    athlete: Athlete = Depends(get_current_athlete),
    repo: AccountRepo = Depends(get_account_repo),
) -> AccountExportManifestResponse:
    _, resources = await repo.export(athlete.id)
    return AccountExportManifestResponse(
        generated_at=datetime.now(UTC),
        download_url=str(request.url_for("download_account_export")),
        resources=[
            AccountExportResourceManifest(name=resource.name, count=len(resource.records))
            for resource in resources
        ],
    )


@router.get("/account.json", response_model=AccountExportDocument, name="download_account_export")
async def download_account_export(
    athlete: Athlete = Depends(get_current_athlete),
    repo: AccountRepo = Depends(get_account_repo),
) -> Response:
    account, resources = await repo.export(athlete.id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="athlete not found")
    document = AccountExportDocument(
        exported_at=datetime.now(UTC), athlete=jsonable_encoder(account), resources=resources
    )
    return Response(
        content=document.model_dump_json(),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="running-man-account-export.json"'},
    )


@router.get(
    "/workout.zwo",
    response_class=Response,
    responses={200: {"content": {"application/xml": {"schema": {"type": "string"}}}}},
)
async def workout_zwo(
    event_id: str = Query(),
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> Response:
    event = await repo.get_by_id(athlete.id, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    xml = event.get("workout_xml")
    if not xml:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="workout xml not found")
    return Response(str(xml), media_type="application/xml")
