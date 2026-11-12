from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from presentation.api.domain_contracts import PhysiologicalDomains
from presentation.api.readiness_contract import (
    ReadinessFactorResponse,
    WellnessReadingsResponse,
)


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
    critical_speed_pace_s_per_km: float | None
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
    duration_s: int | None
    avg_hr: int | None
    avg_power: int | None
    avg_speed: float | None = None
    pace_s_per_km: float | None = None


class HrZoneTimesResponse(AnalysisAnalyticsResponse):
    z1: int
    z2: int
    z3: int
    z4: int
    z5: int


class HrZoneResidenceResponse(AnalysisAnalyticsResponse):
    """Time spent in one heart-rate zone, with the boundaries that applied.

    ``min_bpm``/``max_bpm`` are the athlete's own zone edges for the date of
    the activity, so the page can print the range next to the time.
    ``pct`` is the share of the covered time, and the shares of all five zones
    add up to 100.
    """

    zone: int
    seconds: int
    pct: float
    min_bpm: int | None = None
    max_bpm: int | None = None


class BiomechanicsSampleCountsResponse(AnalysisAnalyticsResponse):
    """How many samples each biomechanics figure was computed from.

    A single-sample average is not a measured average, so the page needs to
    see the sample count behind every figure it shows.
    """

    cadence: int = 0
    stride_length: int = 0
    vertical_oscillation: int = 0
    ground_contact_time: int = 0
    left_right_balance: int = 0


class BiomechanicsResponse(AnalysisAnalyticsResponse):
    """The biomechanics matrix the activity detail page shows.

    A field is ``None`` when the device did not record that channel; the page
    shows "未记录" for those. ``sample_counts`` says how many samples each
    figure was computed from, so a single-sample average cannot be mistaken
    for a measured average.
    """

    avg_cadence_spm: float | None = None
    avg_stride_length_m: float | None = None
    avg_vertical_oscillation_cm: float | None = None
    avg_ground_contact_time_ms: float | None = None
    avg_lr_balance_pct: float | None = None
    sample_counts: BiomechanicsSampleCountsResponse = Field(
        default_factory=BiomechanicsSampleCountsResponse
    )


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
    # 分段表需要的额外信息：真实配速波动与最快分段。
    pace_variation_s: float | None = None
    fastest_lap_index: int | None = None
    # 心率区间驻留时间与边界。
    zone_residence: list[HrZoneResidenceResponse] = Field(default_factory=list)
    dominant_zone: int | None = None
    # 跑步动力学矩阵。
    biomechanics: BiomechanicsResponse = Field(default_factory=BiomechanicsResponse)


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
    work_domain_seconds: PhysiologicalDomains = Field(default_factory=PhysiologicalDomains)
    work_domain_share: PhysiologicalDomains = Field(default_factory=PhysiologicalDomains)


class CoachRecoverySignalsResponse(AnalysisAnalyticsResponse):
    hrv_trend_direction: Literal["up", "down", "stable"]
    rhr_trend_direction: Literal["up", "down", "stable"]
    sleep_avg_7d: float
    readiness_score: int
    # 休息前提下 TSB 回到正区间所需的天数；投影窗口内到不了就是 null。
    tsb_recovery_days: int | None = None


class CoachPlanAdherenceResponse(AnalysisAnalyticsResponse):
    completed_tss_7d: float
    planned_tss_7d: float
    adherence_pct: float
    type_match: float | None = None
    structure_match: float | None = None
    domain_match: float | None = None


class CoachCaveatResponse(AnalysisAnalyticsResponse):
    field: str
    issue: str
    impact: str


class CoachNextWorkoutResponse(AnalysisAnalyticsResponse):
    name: str | None
    sport_type: str | None
    predicted_tss: float | None


class CoachPaceTargetsResponse(AnalysisAnalyticsResponse):
    intensity: str
    min_s_per_km: float
    max_s_per_km: float


class CoachRecommendationResponse(AnalysisAnalyticsResponse):
    action: str
    workout_type: str
    duration_min: int
    target_tss: int
    intensity: str
    pace_targets: CoachPaceTargetsResponse | None
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
    # 当日的健康读数（HRV、静息心率、睡眠）与本人七日基线。
    readings: WellnessReadingsResponse = Field(default_factory=WellnessReadingsResponse)


class CoachContextResponse(AnalysisAnalyticsResponse):
    data_freshness: dict[Literal["activities", "wellness"], CoachFreshnessEntryResponse]
    recent_load: CoachRecentLoadResponse
    recovery_signals: CoachRecoverySignalsResponse
    plan_adherence: CoachPlanAdherenceResponse
    missing_data_caveats: list[CoachCaveatResponse]
    recommendation: CoachRecommendationResponse
    readiness: CoachContextReadinessResponse
