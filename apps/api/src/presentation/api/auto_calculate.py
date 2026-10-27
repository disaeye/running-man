from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from application.physiology.physiology_windows import physiology_window_days
from application.physiology.service import (
    MIN_VDOT_EFFORTS,
    cached_physiology,
    calculate_physiology,
)
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric
from domain.physiology.hrmax import MIN_SESSIONS_FALLBACK
from domain.physiology.lthr import MIN_HARD_EFFORTS
from infrastructure.auth.models import Athlete
from infrastructure.repositories.physiology import PhysiologyRepo
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
    # The timestamp is reported even when the values are too old to serve: "上次
    # 估算 10-18" and "还没有估算过" are different facts, and saying the second
    # one while three stored thresholds are in force would be a lie.
    row = await PhysiologyRepo().cached(athlete.id)
    cached = await cached_physiology(athlete.id, row=row)
    computed_at = _as_datetime(row.get("physiology_updated_at")) if row is not None else None
    if cached is None:
        return _stale_physiology(computed_at)
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
        computed_at=cached.computed_at,
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
                "required_sessions": MIN_SESSIONS_FALLBACK,
                "input_window_days": physiology_window_days(Metric.HR_MAX),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
        lthr=LthrEstimateResponse.model_validate(
            {
                **result.lthr,
                "required_efforts": MIN_HARD_EFFORTS,
                "input_window_days": physiology_window_days(Metric.LTHR),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
        threshold_pace=ThresholdPaceEstimateResponse.model_validate(
            {
                **result.threshold_pace,
                "required_efforts": MIN_VDOT_EFFORTS,
                "input_window_days": physiology_window_days(Metric.THRESHOLD_PACE),
                "algorithm_version": algorithm_contract(Algorithm.PHYSIOLOGY).version,
            }
        ),
        computed_at=result.computed_at,
    )


def _stale_physiology(computed_at: datetime | None) -> PhysiologyResponse:
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
        computed_at=computed_at,
    )


def _as_datetime(value: object) -> datetime | None:
    return value if isinstance(value, datetime) else None
