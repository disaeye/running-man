from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from domain.generated.metrics import Metric
from domain.metric_series import (
    MetricSeriesGrain,
    MetricSeriesQuery,
    expected_period_count,
    metric_series_definition,
)
from infrastructure.auth.models import Athlete
from infrastructure.repositories.metric_series import MetricSeriesRepo
from presentation.api.metric_schemas import (
    MetricSeriesBatchResponse,
    MetricSeriesCoverage,
    MetricSeriesPoint,
    MetricSeriesResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/metrics", tags=["metrics"])


def get_metric_series_repo() -> MetricSeriesRepo:
    return MetricSeriesRepo()


async def _fetch_series(
    metric: Metric,
    grain: MetricSeriesGrain,
    start: date,
    end: date,
    sport: str | None,
    athlete_id: object,
    repo: MetricSeriesRepo,
) -> MetricSeriesResponse:
    definition = metric_series_definition(metric)
    query = MetricSeriesQuery(
        athlete_id=athlete_id,
        metric=metric,
        grain=grain,
        start=start,
        end=end,
        sport=sport,
    )
    records = await repo.fetch(query)
    expected = expected_period_count(start, end, grain)
    observed = len(records)
    ratio = observed / expected if expected else 0.0
    return MetricSeriesResponse(
        metric=metric.value,
        grain=grain.value,
        unit=definition.unit,
        label=definition.label,
        coverage=MetricSeriesCoverage(expected=expected, observed=observed, ratio=ratio),
        points=[
            MetricSeriesPoint(period=record.period, value=record.value, samples=record.samples)
            for record in records
        ],
    )


@router.get("/series", response_model=MetricSeriesResponse)
async def get_metric_series(
    metric: Metric,
    grain: MetricSeriesGrain,
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    sport: str | None = None,
    athlete: Athlete = Depends(get_current_athlete),
    repo: MetricSeriesRepo = Depends(get_metric_series_repo),
) -> MetricSeriesResponse:
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to before from",
        )
    return await _fetch_series(metric, grain, start, end, sport, athlete.id, repo)


@router.get("/series/batch", response_model=MetricSeriesBatchResponse)
async def get_metric_series_batch(
    metrics: str = Query(min_length=1),
    grain: MetricSeriesGrain = MetricSeriesGrain.DAILY,
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    sport: str | None = None,
    athlete: Athlete = Depends(get_current_athlete),
    repo: MetricSeriesRepo = Depends(get_metric_series_repo),
) -> MetricSeriesBatchResponse:
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to before from",
        )
    requested = [m.strip() for m in metrics.split(",") if m.strip()]
    if not requested:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least one metric required",
        )
    series: list[MetricSeriesResponse] = []
    for raw in requested:
        try:
            metric = Metric(raw)
        except ValueError:
            continue
        series.append(await _fetch_series(metric, grain, start, end, sport, athlete.id, repo))
    return MetricSeriesBatchResponse(grain=grain.value, series=series)
