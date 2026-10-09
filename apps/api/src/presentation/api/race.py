"""Race prediction endpoints — running only.

GET  /api/race/predict : auto-detect the Riegel basis from running personal records.
POST /api/race/predict : predict from an explicit recent effort.

Both return Riegel predictions for 5K/10K/half/marathon with a critical-speed
cross-check when enough running history is available.
"""

from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from application.thresholds.effective import resolve_effective_thresholds
from domain.insights.prs import compute_run_prs, is_run_sport
from domain.physiology.threshold_pace import extract_efforts_from_activities
from domain.race.prediction import predict_race, select_basis_from_prs
from infrastructure.auth.models import Athlete
from infrastructure.repositories.analytics import AnalyticsRepo
from presentation.api.analytics_analysis_contracts import RacePredictionResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/race", tags=["race"])


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    recent_time_s: float = Field(
        ..., gt=0, description="Finish time of the recent effort (seconds)"
    )
    recent_distance_m: int = Field(..., gt=0, description="Distance of the recent effort (metres)")


async def get_running_activities(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[dict[str, object]]:
    """Dependency: all activities for the athlete (last 2 years), used for PRs + cross-check."""
    return await _fetch_running_activities(athlete.id)


async def get_effort_references(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> tuple[int | None, int | None]:
    """The athlete's LTHR and HRmax, for filtering hard efforts.

    Passed to ``extract_efforts_from_activities`` so a race prediction is built
    from genuine efforts rather than from every run. Read through the shared
    resolver so this matches what the rest of the app considers current.
    """
    thresholds = await resolve_effective_thresholds(athlete.id)
    return (
        _positive_int(thresholds.lthr.value),
        _positive_int(thresholds.hr_max.value),
    )


def _positive_int(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) and value > 0 else None


@router.get("/predict", response_model=RacePredictionResponse)
async def get_predict(
    activities: Annotated[list[dict[str, object]], Depends(get_running_activities)],
    references: Annotated[tuple[int | None, int | None], Depends(get_effort_references)],
) -> RacePredictionResponse:
    """Auto-detect the Riegel basis from running personal records."""
    lthr, hr_max = references
    run_activities = [a for a in activities if is_run_sport(str(a.get("sport")))]
    basis = select_basis_from_prs(compute_run_prs(run_activities))  # type: ignore[arg-type]
    if basis is None:
        return RacePredictionResponse(
            predictions=[], data_sufficient=False, basis=None, confidence=None
        )
    efforts = extract_efforts_from_activities(
        activities, sport_filter="Run", lthr=lthr, hr_max=hr_max
    )
    result = predict_race(
        float(cast(float, basis["time_s"])), float(cast(float, basis["distance_m"])), efforts
    )
    cast(dict[str, object], result["basis"])["source"] = "personal_record"
    return RacePredictionResponse.model_validate(result)


@router.post("/predict", response_model=RacePredictionResponse)
async def post_predict(
    body: PredictRequest,
    activities: Annotated[list[dict[str, object]], Depends(get_running_activities)],
    references: Annotated[tuple[int | None, int | None], Depends(get_effort_references)],
) -> RacePredictionResponse:
    """Predict from an explicit recent effort; cross-checked with history if present."""
    lthr, hr_max = references
    efforts = extract_efforts_from_activities(
        activities, sport_filter="Run", lthr=lthr, hr_max=hr_max
    )
    result = predict_race(body.recent_time_s, float(body.recent_distance_m), efforts)
    cast(dict[str, object], result["basis"])["source"] = "manual"
    return RacePredictionResponse.model_validate(result)


async def _fetch_running_activities(athlete_id: UUID) -> list[dict[str, object]]:
    return await AnalyticsRepo().running_activities(athlete_id)
