"""Response mapping for plan-adjustment proposals."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from infrastructure.repositories.plan_adjustments import PENDING


class AdjustmentTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str
    label: str
    detail: str


class PlanAdjustmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    adjustment_id: str
    event_id: str
    event_title: str | None = None
    event_date: date | None = None
    trigger_type: str
    trigger_summary: str
    load_delta_pct: float
    status: str
    created_at: str
    triggers: list[AdjustmentTriggerResponse] = Field(default_factory=list)


class AdjustmentListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    adjustments: list[PlanAdjustmentResponse]


class DecisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    adjustment_id: str
    status: str


def response(row: dict[str, object]) -> PlanAdjustmentResponse:
    """One stored proposal as an API response."""
    summary = str(row.get("trigger_summary") or "")
    triggers = [
        AdjustmentTriggerResponse(key=key, label=key, detail=detail)
        for key, detail in _split_summary(summary)
    ]
    delta = row.get("load_delta_pct")
    load_delta_pct = float(delta) if isinstance(delta, int | float) else 0.0
    event_date = row.get("event_date")
    return PlanAdjustmentResponse(
        adjustment_id=str(row.get("adjustment_id")),
        event_id=str(row.get("event_id")),
        event_title=_text(row.get("event_title")),
        event_date=event_date if isinstance(event_date, date) else None,
        trigger_type=str(row.get("trigger_type") or ""),
        trigger_summary=summary,
        load_delta_pct=load_delta_pct,
        status=str(row.get("status") or PENDING),
        created_at=str(row.get("created_at") or ""),
        triggers=triggers,
    )


def _split_summary(summary: str) -> list[tuple[str, str]]:
    """从已存摘要提取触发条件。"""
    return [("trigger", part) for part in summary.split("；") if part]


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
