from datetime import date

from pydantic import BaseModel, Field


class MetricSeriesCoverage(BaseModel):
    expected: int = Field(ge=0)
    observed: int = Field(ge=0)
    ratio: float = Field(ge=0, le=1)


class MetricSeriesPoint(BaseModel):
    period: date
    value: float
    samples: int = Field(ge=0)


class MetricSeriesResponse(BaseModel):
    metric: str
    grain: str
    unit: str
    label: str
    coverage: MetricSeriesCoverage
    points: list[MetricSeriesPoint]


class MetricSeriesBatchResponse(BaseModel):
    grain: str
    series: list[MetricSeriesResponse]
