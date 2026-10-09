from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from application.physiology.algorithm_contract import algorithm_contract, physiology_window_days
from application.physiology.service import cached_physiology, calculate_physiology
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric
from infrastructure.auth.models import Athlete
from presentation.api.analytics_performance_contracts import (
    AutoCalculateResponse,
    HrMaxEstimateResponse,
    LthrEstimateResponse,
    PhysiologyResponse,
    ThresholdPaceEstimateResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/athletes", tags=["athletes"])
@router.get("/me/physiology", response_model=PhysiologyResponse)
async def physiology(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> PhysiologyResponse:
    cached = await cached_physiology(athlete.id)
    if cached is None:
        return _stale_physiology()
    return PhysiologyResponse(
        hr_max=cached.hr_max,
        lthr=cached.lthr,
        threshold_pace=cached.threshold_pace,
        data_sufficient=True,
        confidence="cached",
        algorithm_version=cached.algorithm_version,
        computation_run_id=cached.computation_run_id,
        freshness="fresh",
        source="derived_metric_facts",
    )


@router.post("/me/auto-calculate", response_model=AutoCalculateResponse)
async def auto_calculate(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> AutoCalculateResponse:
    result = await calculate_physiology(athlete.id)
    return AutoCalculateResponse(
        hr_max=HrMaxEstimateResponse.model_validate(
            {
                **result.hr_max,
                "input_window_days": physiology_window_days(Metric.HR_MAX),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
        lthr=LthrEstimateResponse.model_validate(
            {
                **result.lthr,
                "input_window_days": physiology_window_days(Metric.LTHR),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
        threshold_pace=ThresholdPaceEstimateResponse.model_validate(
            {
                **result.threshold_pace,
                "input_window_days": physiology_window_days(Metric.THRESHOLD_PACE),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
    )


def _stale_physiology() -> PhysiologyResponse:
    return PhysiologyResponse(
        hr_max=None,
        lthr=None,
        threshold_pace=None,
        data_sufficient=False,
        confidence="stale",
        algorithm_version=None,
        computation_run_id=None,
        freshness="stale",
        source="derived_metric_facts",
    )
