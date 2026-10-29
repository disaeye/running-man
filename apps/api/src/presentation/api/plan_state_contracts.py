"""Response models for the active-plan endpoint."""

from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlanPhaseView(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    label: str
    start_date: date
    end_date: date
    target_weekly_tss: float | None = None
    target_weekly_distance_m: float | None = None
    is_current: bool = False


class PlanSessionView(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str
    date: date
    title: str
    training_type: str | None = None
    duration_min: int | None = None
    predicted_tss: float | None = None
    predicted_distance_m: float | None = None
    pace_min_s_km: int | None = None
    pace_max_s_km: int | None = None
    is_completed: bool = False


class PlanPaceTarget(BaseModel):
    """One of the five Daniels training paces."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    key: Literal["easy", "marathon", "threshold", "interval", "repetition"]
    label: str
    min_s_per_km: int
    max_s_per_km: int


class ActivePlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    goal_id: UUID | None = None
    goal_title: str | None = None
    goal_type: str | None = None
    target_date: date | None = None
    race_distance_m: float | None = None
    race_target_time_s: int | None = None
    phases: list[PlanPhaseView] = Field(default_factory=list)
    current_phase: PlanPhaseView | None = None
    week_start: date | None = None
    week_end: date | None = None
    week_sessions: list[PlanSessionView] = Field(default_factory=list)
    week_planned_tss: float | None = None
    week_planned_distance_m: float | None = None
    week_actual_tss: float | None = None
    week_actual_distance_m: float | None = None
    phase_week_number: int | None = None
    phase_total_weeks: int | None = None
    plan_progress_pct: float | None = None
    vdot: float | None = None
    training_paces: list[PlanPaceTarget] = Field(default_factory=list)
    long_run_day: int | None = None
