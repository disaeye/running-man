from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends

from application.computation.queue_worker import RECOMPUTE_QUEUE
from application.data_health import compute_data_health
from application.data_quality import compute_data_quality
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from presentation.api.analytics_health_contracts import DataHealthResponse, DataQualityResponse
from presentation.api.schemas_core import RecomputeJobStatusResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/data", tags=["data"])


def get_data_health_pool() -> Any:
    return get_pool()


@router.get("/health", response_model=DataHealthResponse)
async def get_data_health(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db_pool: Annotated[Any, Depends(get_data_health_pool)],
) -> DataHealthResponse:
    return DataHealthResponse.model_validate(await compute_data_health(athlete.id, db_pool))


@router.get("/recompute-status", response_model=RecomputeJobStatusResponse)
async def get_recompute_status(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> RecomputeJobStatusResponse:
    row = await RECOMPUTE_QUEUE.repository.get_status(athlete.id)
    if row is None:
        return RecomputeJobStatusResponse(status=None)
    return RecomputeJobStatusResponse.model_validate(dict(row))


@router.get("/quality", response_model=DataQualityResponse)
async def get_data_quality(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db_pool: Annotated[Any, Depends(get_data_health_pool)],
) -> DataQualityResponse:
    async with db_pool.connection() as connection:
        health = await compute_data_health(athlete.id, connection)
        quality = await compute_data_quality(athlete.id, connection)
    activities = cast(dict[str, object], health["activities"])
    coverage = cast(dict[str, object], health["coverage"])
    return DataQualityResponse.model_validate(
        {
            **quality,
            "coverage": {
                "activities": {
                    "total_activities": activities["total"],
                    "with_hr": activities["with_hr"],
                    "with_gps": activities["with_gps"],
                    "with_power": activities["with_power"],
                    "with_streams": activities["with_streams"],
                },
                "wellness": coverage["wellness"],
                "strength": coverage["strength"],
                "uploads": coverage["uploads"],
            },
        }
    )
