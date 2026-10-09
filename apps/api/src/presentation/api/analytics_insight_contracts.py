from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class InsightAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class IntensityDistributionResponse(InsightAnalyticsResponse):
    bucket: date
    zone_seconds: tuple[int, int, int, int, int]
    by_zone: dict[str, float]
    distribution_type: Literal["polarized", "pyramidal", "threshold", "high-volume"]


class RunPersonalRecordResponse(InsightAnalyticsResponse):
    type: str
    label: str
    sport: Literal["Run"]
    date: date
    activity_id: str
    value_seconds: float
    value_formatted: str


class RidePersonalRecordResponse(InsightAnalyticsResponse):
    type: str
    label: str
    sport: Literal["Ride"]
    date: date
    activity_id: str
    value_watts: int
    value_formatted: str


class WeeklyProgressResponse(InsightAnalyticsResponse):
    week: str
    planned_tss: float
    actual_tss: float
    planned_sessions: int
    actual_sessions: int
    completion_pct: int | str
    planned_distance_m: float
    actual_distance_m: float


class PlanQualityResponse(InsightAnalyticsResponse):
    grade: Literal["A", "B+", "B", "C"]
    score: int
    strengths: list[str]
    risks: list[str]
    recommendations: list[str]
    message: str
    weekly_tss: float
    target_tss: float
    key_sessions_completed: int
    key_sessions_total: int
    concerns: list[str]


class TaperResponse(InsightAnalyticsResponse):
    is_tapering: bool
    freshness_ok: bool
    recommended_reduction_pct: float
    days_to_race: int | None


class HardDayRangeResponse(InsightAnalyticsResponse):
    start_index: int
    end_index: int


class NextWorkoutResponse(InsightAnalyticsResponse):
    name: str | None
    sport_type: str | None
    predicted_tss: float | None


class TrainingRecommendationResponse(InsightAnalyticsResponse):
    action: str
    workout_type: str
    duration_min: int
    target_tss: int
    intensity: str
    reason: str
    risks: list[str]
    next_workout: NextWorkoutResponse | None


class RecomputeResponse(InsightAnalyticsResponse):
    recompute_status: Literal["queued"]
    recompute_generation: int


class RecommendationItemResponse(InsightAnalyticsResponse):
    type: str
    title: str
    body: str
    priority: Literal["high", "medium", "low"]
    actionable: bool
    action_hint: str | None


class ZoneResponse(InsightAnalyticsResponse):
    zone: int
    name: str
    min_pct: float
    max_pct: float | None
    min_value: float
    max_value: float | None


class ZoneSchemeResponse(InsightAnalyticsResponse):
    """One selectable zone scheme, with whether its inputs are on file.

    `available` is false when a required threshold is missing, and `missing`
    names it, so the picker can explain why a scheme is disabled instead of
    offering it and producing an empty zone table.
    """

    key: str
    label: str
    reference: str
    citation: str | None = None
    available: bool = True
    missing: list[str] = []


class ZonesResponse(InsightAnalyticsResponse):
    """Zone tables for the athlete's thresholds under their chosen scheme.

    ``hr_max``/``lthr``/``resting_hr`` are the resolved values the boundaries
    were built from, so the client can show the inputs next to the output.
    ``hr_scheme`` names which rule produced the boundaries, and
    ``unavailable_requirements`` lists the fields a scheme still needs (empty
    when ``hr_zones`` is populated) — without it the UI cannot tell "no zones
    configured" from "this scheme needs a resting heart rate first".

    ``hr_max_estimated`` marks an age-predicted HRmax: Tanaka et al. report a
    residual SD of 7-11 bpm, so an estimate must never be presented as a
    measured value.
    """

    hr_max: int | None
    hr_max_estimated: bool = False
    hr_max_source: str | None = None
    lthr: int | None = None
    resting_hr: int | None = None
    threshold_pace: float | None = None
    hr_scheme: str = "hrmax"
    hr_scheme_label: str = ""
    hr_scheme_citation: str | None = None
    unavailable_requirements: list[str] = []
    has_overrides: bool = False
    hr_schemes: list[ZoneSchemeResponse] = []
    hr_zones: list[ZoneResponse]
    pace_zones: list[ZoneResponse] | None = None


class ZoneOverrideRowResponse(InsightAnalyticsResponse):
    metric: Literal["hr"]
    zone: int
    min_pct: float
    max_pct: float
    updated_at: datetime


class ZoneOverrideUpdateResponse(InsightAnalyticsResponse):
    metric: Literal["hr"]
    overrides: list[ZoneOverrideRowResponse]
