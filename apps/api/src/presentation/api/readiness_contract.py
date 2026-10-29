from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from domain.insights.readiness import Readiness


class ReadinessFactorResponse(BaseModel):
    name: str
    impact: Literal["positive", "negative", "neutral"]
    detail: str


class WellnessReadingResponse(BaseModel):
    """One wellness reading of the day, with the athlete's own baseline.

    ``baseline`` is the seven-day mean of the same reading; ``delta`` is the
    difference from it. A reading that was not measured is ``None`` at the
    field level, so the page can say "未记录" instead of showing a zero.
    """

    value: float
    unit: str
    baseline: float | None = None
    delta: float | None = None


class WellnessReadingsResponse(BaseModel):
    """The day's wellness readings, each with the athlete's own baseline.

    The three readings the page shows are named fields rather than a map, so
    the contract states exactly which ones exist and what their units are.
    """

    # 心率变异性（ms）。
    hrv: WellnessReadingResponse | None = None
    # 静息心率（bpm）。
    resting_hr: WellnessReadingResponse | None = None
    # 睡眠时长（秒）。
    sleep_secs: WellnessReadingResponse | None = None


class LocalReadinessProvenanceResponse(BaseModel):
    wellness_as_of: date | None
    pmc_as_of: date | None
    factor_sources: dict[str, Literal["health_wellness", "current_daily_facts"]]


class LocalReadinessResponse(BaseModel):
    """Locally computed readiness.

    ``data_sufficient`` is the machine-readable answer to "was anything
    measured". Without it a client can only infer that from the score — and a
    score of 50 means both "assessed as middling" and "no data at all", which
    are opposite messages. The UI previously string-matched the factor details
    to tell them apart, which breaks the moment the wording changes.
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
    provenance: LocalReadinessProvenanceResponse


class SourceReadinessResponse(BaseModel):
    score: int
    source: Literal["intervals_icu"]
    observed_on: date


class ReadinessResponse(BaseModel):
    local_readiness: LocalReadinessResponse
    source_readiness: SourceReadinessResponse | None


def build_readiness_response(
    target_day: date,
    local_readiness: Readiness,
    wellness: list[dict[str, object]],
    loads: list[dict[str, object]],
) -> ReadinessResponse:
    source_score = _source_score(target_day, wellness)
    return ReadinessResponse(
        local_readiness=LocalReadinessResponse.model_validate(
            local_readiness
            | {
                "provenance": LocalReadinessProvenanceResponse(
                    wellness_as_of=_latest_day(wellness),
                    pmc_as_of=_latest_day(loads),
                    factor_sources={
                        "sleep": "health_wellness",
                        "resting_hr": "health_wellness",
                        "hrv": "health_wellness",
                        "tsb": "current_daily_facts",
                        "atl_velocity": "current_daily_facts",
                    },
                )
            }
        ),
        source_readiness=(
            SourceReadinessResponse(
                score=source_score,
                source="intervals_icu",
                observed_on=target_day,
            )
            if source_score is not None
            else None
        ),
    )


def _source_score(target_day: date, wellness: list[dict[str, object]]) -> int | None:
    for row in wellness:
        if _as_day(row.get("day")) == target_day:
            value = row.get("readiness")
            if isinstance(value, int | float | Decimal | str):
                return int(value)
    return None


def _latest_day(rows: list[dict[str, object]]) -> date | None:
    days = [_as_day(row.get("day")) for row in rows]
    present_days = [day for day in days if day is not None]
    return max(present_days) if present_days else None


def _as_day(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    return None
