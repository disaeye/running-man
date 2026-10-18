from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from application.recommendations import recommendations_for_day
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from presentation.api.analytics_insight_contracts import RecommendationItemResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
@router.get("", response_model=list[RecommendationItemResponse])
async def get_recommendations(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[RecommendationItemResponse]:
    # The recommendations are addressed to a training day: the load row is
    # matched by exact day equality and tomorrow's planned events are read on
    # top of it. A host-clock day misses both for an athlete east of Greenwich.
    items = await recommendations_for_day(athlete.id, today_in_zone(athlete.timezone))
    return [RecommendationItemResponse.model_validate(item) for item in items]
