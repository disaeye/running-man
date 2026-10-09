from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HealthAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DataHealthActivitiesResponse(HealthAnalyticsResponse):
    data_as_of: datetime | None
    total: int
    with_hr: int
    with_gps: int
    with_power: int
    with_streams: int = 0

class DataHealthWellnessResponse(HealthAnalyticsResponse):
    data_as_of: date | None
    total_days: int
    latest_day: date | None


class DataHealthTrainingLoadResponse(HealthAnalyticsResponse):
    data_as_of: date | None


class DataHealthActivityCompletenessResponse(HealthAnalyticsResponse):
    with_hr: int
    with_gps: int
    with_power: int


class DataHealthCompletenessResponse(HealthAnalyticsResponse):
    activities: DataHealthActivityCompletenessResponse


class DataHealthGapResponse(HealthAnalyticsResponse):
    from_: date = Field(alias="from")
    to: date

class DataHealthActivityCoverageResponse(HealthAnalyticsResponse):
    total_activities: int
    with_hr: int
    with_gps: int
    with_power: int
    with_streams: int


class DataHealthWellnessCoverageResponse(HealthAnalyticsResponse):
    sleep_days_28d: int
    rhr_days_28d: int
    hrv_days_28d: int = 0


class DataHealthStrengthCoverageResponse(HealthAnalyticsResponse):
    sessions_14d: int = 0
    sessions_total: int = 0


class DataHealthUploadCoverageResponse(HealthAnalyticsResponse):
    runs_30d: int = 0
    failed_30d: int = 0


class DataHealthCoverageResponse(HealthAnalyticsResponse):
    activities: DataHealthActivityCoverageResponse
    wellness: DataHealthWellnessCoverageResponse
    strength: DataHealthStrengthCoverageResponse | None = None
    uploads: DataHealthUploadCoverageResponse | None = None


class DataHealthResponse(HealthAnalyticsResponse):
    activities: DataHealthActivitiesResponse
    wellness: DataHealthWellnessResponse
    training_load: DataHealthTrainingLoadResponse
    completeness: DataHealthCompletenessResponse
    coverage: DataHealthCoverageResponse | None = None
    gaps: list[DataHealthGapResponse]


class QualitySummaryResponse(HealthAnalyticsResponse):
    status: Literal["ok", "warning", "error"]
    issue_count: int
    last_checked_at: datetime


class DataQualityIssueResponse(HealthAnalyticsResponse):
    key: str
    severity: Literal["info", "warning", "error"]
    label: str
    entity_type: str
    count: int | None


class DataQualityCoverageResponse(HealthAnalyticsResponse):
    activities: DataHealthActivityCoverageResponse
    wellness: DataHealthWellnessCoverageResponse
    strength: DataHealthStrengthCoverageResponse | None = None
    uploads: DataHealthUploadCoverageResponse | None = None


class DataQualityResponse(HealthAnalyticsResponse):
    summary: QualitySummaryResponse
    coverage: DataQualityCoverageResponse
    issues: list[DataQualityIssueResponse]


class WellnessEntryResponse(HealthAnalyticsResponse):
    day: date
    resting_hr: int | None
    weight: float | None
    sleep_secs: int | None
    sleep_score: int | None
    fatigue: int | None
    soreness: int | None
    hrv: float | None
    vo2max: float | None
    steps: int | None
    stress: int | None
    mood: int | None
    motivation: int | None
    source_readiness: int | None
    comments: str | None


class SleepNightResponse(HealthAnalyticsResponse):
    date: date
    sleep_start: datetime | None
    sleep_end: datetime | None
    total_sleep_s: int | None
    deep_sleep_s: int | None
    rem_sleep_s: int | None
    light_sleep_s: int | None
    awake_count: int | None
    sleep_score: int | None


class SleepAggregatesResponse(HealthAnalyticsResponse):
    avg_total_sleep_7d: int | None
    sleep_debt_7d: int | None
    consistency_score: int | None


class SleepAnalysisResponse(HealthAnalyticsResponse):
    nights: list[SleepNightResponse]
    aggregates: SleepAggregatesResponse


class WeightEntryResponse(HealthAnalyticsResponse):
    date: date
    weight_kg: float
    body_fat_pct: float | None


class WeightTrendResponse(HealthAnalyticsResponse):
    current: float | None
    avg_30d: float | None
    trend_30d: float | None
    min_30d: float | None
    max_30d: float | None


class WeightListResponse(HealthAnalyticsResponse):
    entries: list[WeightEntryResponse]
    stats: WeightTrendResponse


class WeightDeleteResponse(HealthAnalyticsResponse):
    status: Literal["deleted"]
