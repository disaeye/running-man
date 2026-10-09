from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from typing import Final

from domain.generated.metrics import METRIC_DEFINITIONS, Metric


class MetricSeriesGrain(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"


class MetricAggregation(StrEnum):
    SUM = "sum"
    AVG = "avg"


@dataclass(frozen=True, slots=True)
class MetricSeriesDefinition:
    metric: Metric
    label: str
    unit: str
    aggregation: MetricAggregation


@dataclass(frozen=True, slots=True)
class MetricSeriesQuery:
    athlete_id: object
    metric: Metric
    grain: MetricSeriesGrain
    start: date
    end: date
    sport: str | None = None


@dataclass(frozen=True, slots=True)
class MetricSeriesRecord:
    period: date
    value: float
    samples: int


SUM_METRICS: Final = frozenset({
    Metric.DAILY_TSS,
    Metric.DISTANCE_M,
    Metric.DURATION_S,
    Metric.SOURCE_TRAINING_LOAD,
    Metric.TSS,
    Metric.STEPS,
    Metric.KCAL_CONSUMED,
    Metric.CARBS_G,
    Metric.PROTEIN_G,
    Metric.FAT_G,
})


def metric_series_definition(metric: Metric) -> MetricSeriesDefinition:
    row = _METRIC_ROWS[metric.value]
    aggregation = MetricAggregation.SUM if metric in SUM_METRICS else MetricAggregation.AVG
    return MetricSeriesDefinition(
        metric=metric,
        label=str(row["display_name"]),
        unit=str(row["storage_unit"]),
        aggregation=aggregation,
    )


def expected_period_count(start: date, end: date, grain: MetricSeriesGrain) -> int:
    match grain:
        case MetricSeriesGrain.DAILY:
            return (end - start).days + 1
        case MetricSeriesGrain.WEEKLY:
            start_week = start - timedelta(days=start.weekday())
            end_week = end - timedelta(days=end.weekday())
            return ((end_week - start_week).days // 7) + 1


_METRIC_ROWS: Final = {
    str(row["key"]): row
    for row in METRIC_DEFINITIONS
}
