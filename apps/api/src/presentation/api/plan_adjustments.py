"""Review measured session-adjustment proposals before changing the plan.

The endpoints list pending proposals, record measured trigger details, and
apply or keep the original prescription only after the athlete chooses.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from domain.insights.load_adjustment import detect_adjustment
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool, open_pool
from infrastructure.repositories.plan_adjustments import (
    APPLIED,
    REVERTED,
    PlanAdjustmentRepo,
)
from presentation.api.plan_adjustment_inputs import detection_inputs, session_row
from presentation.api.plan_adjustment_responses import (
    AdjustmentListResponse,
    DecisionResponse,
    PlanAdjustmentResponse,
    response,
)
from presentation.api.plan_adjustment_rules import (
    encode_prescription,
    pending_adjustment,
    scaled_prescription,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/plan", tags=["plan"])


class DetectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str


@router.get("/adjustments", response_model=AdjustmentListResponse)
async def list_adjustments(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> AdjustmentListResponse:
    """The athlete's adjustment proposals."""
    repo = PlanAdjustmentRepo()
    rows = await repo.list_for_athlete(athlete.id, status_filter)
    return AdjustmentListResponse(
        adjustments=[response(row) for row in rows],
    )


@router.post("/adjustments/detect", response_model=PlanAdjustmentResponse)
async def detect_adjustment_for_event(
    body: DetectionRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> PlanAdjustmentResponse:
    """Check a planned session and record a proposal for review."""
    today = today_in_zone(athlete.timezone)
    await open_pool()
    async with get_pool().connection() as conn:
        event = await session_row(conn, athlete.id, body.event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到这节训练")
        inputs = await detection_inputs(conn, athlete.id, today)

    adjustment = detect_adjustment(
        event_id=body.event_id,
        hrv_today=inputs.hrv_today,
        hrv_baseline=inputs.hrv_baseline,
        hr_drift_bpm=inputs.hr_drift_bpm,
        long_run_seconds=inputs.long_run_seconds,
    )
    if adjustment is None:
        raise HTTPException(
            status_code=status.HTTP_200_OK,
            detail="这节训练没有需要调整的迹象",
        )

    original = event.get("workout_prescription")
    original_dict = original if isinstance(original, dict) else None
    adjusted = scaled_prescription(original_dict, adjustment.reduction_pct)
    summary = "；".join(trigger.detail for trigger in adjustment.triggers)

    repo = PlanAdjustmentRepo()
    row = await repo.insert(
        athlete.id,
        body.event_id,
        ",".join(trigger.key for trigger in adjustment.triggers),
        summary,
        original_dict,
        adjusted,
        -adjustment.reduction_pct,
    )
    return response(row)


@router.post("/adjustments/{adjustment_id}/accept", response_model=DecisionResponse)
async def accept_adjustment(
    adjustment_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> DecisionResponse:
    """Accept a proposal: the session's prescription is rewritten."""
    repo = PlanAdjustmentRepo()
    pending = await pending_adjustment(repo, athlete.id, adjustment_id)
    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="找不到这条待确认的调整建议"
        )
    adjusted = pending.get("adjusted_prescription")
    if not isinstance(adjusted, dict):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="这条建议没有可用的调整方案"
        )
    await open_pool()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            """
            UPDATE training_calendar
            SET workout_prescription = %s::jsonb
            WHERE athlete_id = %s AND event_id = %s
            """,
            (
                encode_prescription(adjusted),
                athlete.id,
                str(pending["event_id"]),
            ),
        )
    decided = await repo.decide(athlete.id, adjustment_id, APPLIED)
    if decided is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这条建议已经被决定过了")
    return DecisionResponse(
        adjustment_id=str(decided["adjustment_id"]), status=str(decided["status"])
    )


@router.post("/adjustments/{adjustment_id}/keep", response_model=DecisionResponse)
async def keep_adjustment(
    adjustment_id: UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> DecisionResponse:
    """Keep the original plan: the proposal is closed without a change."""
    repo = PlanAdjustmentRepo()
    decided = await repo.decide(athlete.id, adjustment_id, REVERTED)
    if decided is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="找不到这条待确认的调整建议"
        )
    return DecisionResponse(
        adjustment_id=str(decided["adjustment_id"]), status=str(decided["status"])
    )
