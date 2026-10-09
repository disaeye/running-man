from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal, cast
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from application.computation.orchestration import enqueue_activity_recompute
from domain.ingestion import IngestionError, canonical_source, canonical_sport
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivityRepo
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/activities", tags=["activities"])
MANUAL_NAME_MAX_LENGTH = 200
MANUAL_EVENT_ID_MAX_LENGTH = 200
ManualSport = Literal[
    "Run", "VirtualRun", "TrailRun", "Ride", "VirtualRide", "Bike", "Workout", "Swim"
]


class ManualActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    start_time: datetime
    sport: ManualSport = "Run"
    distance_m: float | None = Field(default=None, gt=0, le=1_000_000)
    duration_s: int = Field(gt=0, le=172_800)
    avg_hr: int | None = Field(default=None, ge=25, le=260)
    max_hr: int | None = Field(default=None, ge=25, le=260)
    rpe: int | None = Field(default=None, ge=1, le=10)
    name: str | None = None
    event_id: str | None = None


class ManualActivityResponse(BaseModel):
    activity_id: str
    start_time: datetime
    sport: str
    distance_m: float | None
    duration_s: int
    avg_hr: int | None
    max_hr: int | None
    source: str
    tss: float | None
    event_id: str | None
    recompute_status: Literal["queued"]
    recompute_generation: int


@router.post("/manual", response_model=ManualActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_activity(
    payload: ManualActivityCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ManualActivityResponse:
    _validate_manual_activity(payload)
    try:
        sport = canonical_sport(payload.sport)
    except IngestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="运动项目不受支持",
        ) from exc
    activity_id = f"manual:{uuid4()}"
    name = payload.name or "手动记录训练"
    raw = {"rpe": payload.rpe, "name": name, "manual": True}
    repo = ActivityRepo()
    event_link = None
    if payload.event_id is not None:
        event_link = {
            "event_id": payload.event_id,
            "timezone": athlete.timezone,
            "local_day": payload.start_time.astimezone(ZoneInfo(athlete.timezone)).date(),
        }
    try:
        row = await repo.create_manual_activity(
            athlete.id,
            {
                "activity_id": activity_id,
                "start_time": payload.start_time,
                "sport": sport,
                "distance_m": payload.distance_m,
                "duration_s": payload.duration_s,
                "avg_hr": payload.avg_hr,
                "max_hr": payload.max_hr,
                "external_id": f"manual:{activity_id}",
                "source": canonical_source("manual"),
                "file_type": "manual",
                "name": name,
                "raw_data": raw,
            },
            event_link,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="计划训练不存在",
        ) from exc
    generation = await _recompute(athlete.id)
    return ManualActivityResponse(
        activity_id=str(row["activity_id"]),
        start_time=cast(datetime, row["start_time"]),
        sport=str(row["sport"]),
        distance_m=cast(float | None, row["distance_m"]),
        duration_s=cast(int, row["duration_s"]),
        avg_hr=cast(int | None, row["avg_hr"]),
        max_hr=cast(int | None, row["max_hr"]),
        source="manual",
        tss=None,
        event_id=payload.event_id,
        recompute_status="queued",
        recompute_generation=generation,
    )


def _validate_manual_activity(payload: ManualActivityCreate) -> None:
    if payload.name is not None and len(payload.name) > MANUAL_NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="训练名称不能超过 200 个字符",
        )
    if payload.event_id is not None and not 0 < len(payload.event_id) <= MANUAL_EVENT_ID_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="计划训练编号长度无效",
        )
    if payload.start_time.tzinfo is None or payload.start_time.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="开始时间必须包含运动员当地时区",
        )
    if payload.start_time > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="实际训练开始时间不能晚于当前时间",
        )
    if (
        payload.max_hr is not None
        and payload.avg_hr is not None
        and payload.max_hr < payload.avg_hr
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="最高心率低于平均心率",
        )


async def _recompute(athlete_id: object) -> int:
    return await enqueue_activity_recompute(athlete_id, "manual_activity")  # type: ignore[arg-type]
