from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PerformanceAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PmcPointResponse(PerformanceAnalyticsResponse):
    """One day of the PMC series.

    ``ctl_warming_up`` is true while the CTL value is still dominated by the
    EWMA's zero seed rather than by the athlete's training. The value is still
    returned so a chart can draw it, but anything that states a number to the
    athlete must check this flag — a 42-day time constant needs roughly twice
    that before the figure describes fitness rather than the warm-up.
    """

    day: date
    ctl: float
    atl: float
    tsb: float
    tss: float
    acwr: float | None = None
    ctl_warming_up: bool = False
    mode: Literal["authoritative_all_sports", "approximate_sport_filtered"]
    algorithm_version: str = "1.0.0"


class FtpHistoryResponse(PerformanceAnalyticsResponse):
    effective_from: date
    ftp: int
    source: Literal["manual", "detected"]


class FtpDetectionResponse(PerformanceAnalyticsResponse):
    ftp: int
    method: Literal["20min", "8min", "5min_extrapolated"]
    confidence: float = Field(ge=0, le=1)
    sampled_at: datetime
    algorithm_version: str


class HrMaxEstimateResponse(PerformanceAnalyticsResponse):
    hr_max: int | None
    method: str | None
    confidence: Literal["high", "medium", "low"] | None
    data_sufficient: bool
    near_max_count: int
    session_count: int
    input_window_days: int
    algorithm_version: str


class LthrEstimateResponse(PerformanceAnalyticsResponse):
    lthr: int | None
    method: str | None
    confidence: Literal["high", "medium", "low"] | None
    data_sufficient: bool
    near_threshold_count: int
    source_20min: int | None
    source_60min: int | None
    input_window_days: int
    algorithm_version: str


class ThresholdPaceEstimateResponse(PerformanceAnalyticsResponse):
    threshold_pace_s_per_km: int | None
    critical_speed_ms: float | None
    method: str | None
    confidence: Literal["high", "medium", "low"] | None
    data_sufficient: bool
    effort_count: int
    input_window_days: int
    algorithm_version: str


class AutoCalculateResponse(PerformanceAnalyticsResponse):
    hr_max: HrMaxEstimateResponse
    lthr: LthrEstimateResponse
    threshold_pace: ThresholdPaceEstimateResponse


class PhysiologyResponse(PerformanceAnalyticsResponse):
    hr_max: int | None
    lthr: int | None
    threshold_pace: float | None
    data_sufficient: bool
    confidence: Literal["cached", "stale"]
    algorithm_version: str | None
    computation_run_id: UUID | None
    freshness: Literal["fresh", "stale"]
    source: Literal["derived_metric_facts"]
