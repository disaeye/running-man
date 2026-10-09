from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from application.recommendations import recommendations_for_day
from infrastructure.auth.models import Athlete
from presentation.api.analytics_insight_contracts import RecommendationItemResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
@router.get("", response_model=list[RecommendationItemResponse])
async def get_recommendations(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[RecommendationItemResponse]:
    items = await recommendations_for_day(athlete.id, date.today())
    return [RecommendationItemResponse.model_validate(item) for item in items]
