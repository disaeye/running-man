from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from application.run_classification.persistence import (
    persist_classifications,
    read_classifications,
)
from application.run_classification.service import classify_activities
from domain.run_classification.schema import ALGORITHM_VERSION
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from presentation.api.schemas_run import SessionClassificationResponse
from presentation.auth.deps import get_current_athlete
from presentation.errors import NotFoundError

router = APIRouter(prefix="/activities", tags=["activities"])


class ClassificationListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    athlete_id: str
    activity_count: int
    results: list[SessionClassificationResponse]


class ClassificationItemResponse(SessionClassificationResponse):
    model_config = ConfigDict(frozen=True)


class RecomputeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    athlete_id: str
    activity_count: int
    persisted_count: int
    algorithm_version: str
    computed_at: datetime


@router.get("/classifications", response_model=ClassificationListResponse)
async def list_classifications(
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    athlete: Athlete = Depends(get_current_athlete),
) -> ClassificationListResponse:
    async with get_pool().connection() as conn:
        results = await read_classifications(conn, UUID(str(athlete.id)), start=start, end=end)
    return ClassificationListResponse(
        athlete_id=str(athlete.id),
        activity_count=len(results),
        results=[SessionClassificationResponse.model_validate(item) for item in results],
    )


@router.get("/{activity_id}/classification", response_model=ClassificationItemResponse)
async def get_classification(
    activity_id: str,
    athlete: Athlete = Depends(get_current_athlete),
) -> ClassificationItemResponse:
    async with get_pool().connection() as conn:
        results = await read_classifications(conn, UUID(str(athlete.id)), activity_id=activity_id)
    if not results:
        raise NotFoundError("activity classification not found")
    return ClassificationItemResponse.model_validate(results[0])


@router.post("/classifications/recompute", response_model=RecomputeResponse)
async def recompute_classifications(
    athlete: Athlete = Depends(get_current_athlete),
) -> RecomputeResponse:
    athlete_id = UUID(str(athlete.id))
    async with get_pool().connection() as conn:
        results = await classify_activities(conn, athlete_id)
        persisted = await persist_classifications(conn, athlete_id, results)
        await conn.commit()
    return RecomputeResponse(
        athlete_id=str(athlete.id),
        activity_count=len(results),
        persisted_count=persisted,
        algorithm_version=ALGORITHM_VERSION,
        computed_at=datetime.now(UTC),
    )
