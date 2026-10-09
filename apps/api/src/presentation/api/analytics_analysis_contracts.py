from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from presentation.api.readiness_contract import ReadinessFactorResponse


class AnalysisAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RaceCrossCheckResponse(AnalysisAnalyticsResponse):
    method: Literal["critical_speed"]
    time_s: float
    pace_s_per_km: float
    delta_pct: float


class RacePredictionPointResponse(AnalysisAnalyticsResponse):
    label: Literal["5K", "10K", "half_marathon", "marathon"]
    distance_m: int
    time_s: float
    pace_s_per_km: float
    method: Literal["riegel"] | None = None
    cross_check: RaceCrossCheckResponse | None = None


class RaceBasisCrossCheckResponse(AnalysisAnalyticsResponse):
    critical_speed_ms: float | None
    w_prime_m: float | None
    threshold_pace_s_per_km: float | None
    confidence: Literal["high", "medium", "low"] | None
    data_sufficient: bool
    method: Literal["critical_speed_model"] | None
    effort_count: int


class RaceBasisResponse(AnalysisAnalyticsResponse):
    method: Literal["riegel"]
    recent_time_s: float
    recent_distance_m: float
    exponent: float
    cross_check: RaceBasisCrossCheckResponse
    source: Literal["personal_record", "manual"]


class RacePredictionResponse(AnalysisAnalyticsResponse):
    predictions: list[RacePredictionPointResponse]
    basis: RaceBasisResponse | None
    confidence: Literal["high", "medium", "low"] | None
    data_sufficient: bool


class ActivityAnalysisLapResponse(AnalysisAnalyticsResponse):
    lap_index: int
    distance_m: int
    duration_s: int
    avg_hr: int | None
    avg_power: int | None


class HrZoneTimesResponse(AnalysisAnalyticsResponse):
    z1: int
    z2: int
    z3: int
    z4: int
    z5: int


class PowerCurvePointResponse(AnalysisAnalyticsResponse):
    duration_s: int
    avg_w: int


class ActivityAnalysisSummaryResponse(AnalysisAnalyticsResponse):
    np: int | None
    intensity_factor: float | None = Field(alias="if")
    tss: int | None
    decoupling_pct: float | None


class ActivityAnalysisResponse(AnalysisAnalyticsResponse):
    laps: list[ActivityAnalysisLapResponse]
    hr_zones: HrZoneTimesResponse
    power_curve: list[PowerCurvePointResponse]
    summary: ActivityAnalysisSummaryResponse


class CoachFreshnessEntryResponse(AnalysisAnalyticsResponse):
    data_as_of: date | None
    staleness_bucket: Literal["fresh", "stale", "missing"]


class CoachRecentLoadResponse(AnalysisAnalyticsResponse):
    """Recent load and whether CTL may be quoted.

    ``ctl_warming_up`` is true until enough history exists for the CTL EWMA to
    have converged away from its zero seed. A consumer that states a CTL figure
    must check it: early values describe the warm-up, not the athlete.
    """

    d7_tss: float
    d28_tss: float
    d90_tss: float
    current_ctl: float
    current_atl: float
    current_tsb: float
    ctl_warming_up: bool = False
    ctl_history_days: int = 0


class CoachRecoverySignalsResponse(AnalysisAnalyticsResponse):
    hrv_trend_direction: Literal["up", "down", "stable"]
    rhr_trend_direction: Literal["up", "down", "stable"]
    sleep_avg_7d: float
    readiness_score: int


class CoachPlanAdherenceResponse(AnalysisAnalyticsResponse):
    completed_tss_7d: float
    planned_tss_7d: float
    adherence_pct: float


class CoachCaveatResponse(AnalysisAnalyticsResponse):
    field: str
    issue: str
    impact: str


class CoachNextWorkoutResponse(AnalysisAnalyticsResponse):
    name: str | None
    sport_type: str | None
    predicted_tss: float | None


class CoachRecommendationResponse(AnalysisAnalyticsResponse):
    action: str
    workout_type: str
    duration_min: int
    target_tss: int
    intensity: str
    reason: str
    risks: list[str]
    next_workout: CoachNextWorkoutResponse | None


class CoachContextReadinessResponse(AnalysisAnalyticsResponse):
    """Readiness as the Today page consumes it.

    Carries ``data_sufficient`` so the client can tell an assessed mid-range
    score from the neutral 50 returned when nothing was measured — the two are
    numerically identical but mean opposite things.
    """

    score: int
    level: Literal["high", "moderate", "recovery", "rest"]
    factors: list[ReadinessFactorResponse]
    recommendation: str
    max_intensity: Literal["high", "moderate", "low", "none"]
    data_sufficient: bool = False
    observed_on: date | None = None


class CoachContextResponse(AnalysisAnalyticsResponse):
    data_freshness: dict[Literal["activities", "wellness"], CoachFreshnessEntryResponse]
    recent_load: CoachRecentLoadResponse
    recovery_signals: CoachRecoverySignalsResponse
    plan_adherence: CoachPlanAdherenceResponse
    missing_data_caveats: list[CoachCaveatResponse]
    recommendation: CoachRecommendationResponse
    readiness: CoachContextReadinessResponse
