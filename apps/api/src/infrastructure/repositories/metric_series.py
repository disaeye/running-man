from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import cast

from domain.generated.metrics import Metric
from domain.metric_series import (
    MetricSeriesGrain,
    MetricSeriesQuery,
    MetricSeriesRecord,
    metric_series_definition,
)
from infrastructure.db.pool import ConnectionContext, get_pool
from infrastructure.repositories.metric_series_sql import (
    batch_statement,
    is_wellness_only,
    series_statement,
    sum_metric_keys,
    wellness_statement,
)


def _connect() -> ConnectionContext:
    return get_pool().connection()


@dataclass(frozen=True, slots=True)
class MetricSeriesBatchQuery:
    athlete_id: object
    metrics: tuple[Metric, ...]
    grain: MetricSeriesGrain
    start: date
    end: date
    sport: str | None = None


class MetricSeriesRepo:
    async def fetch(self, query: MetricSeriesQuery) -> list[MetricSeriesRecord]:
        statement = series_statement(
            query.grain, metric_series_definition(query.metric).aggregation
        )
        params = (
            query.athlete_id,
            query.start,
            query.end,
            query.metric.value,
            query.sport,
            query.sport,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(statement, params)
            rows = await cur.fetchall()
        return [
            MetricSeriesRecord(
                period=cast(date, row["period"]),
                value=float(row["value"]),
                samples=int(row["samples"]),
            )
            for row in rows
        ]

    async def fetch_batch(
        self, query: MetricSeriesBatchQuery
    ) -> dict[str, list[MetricSeriesRecord]]:
        """One connection and one SQL statement for every requested metric.

        Wellness-only daily batches read ``health_wellness`` directly. Other
        batches use the fact functions once and group by metric_key together.
        """
        if not query.metrics:
            return {}
        params: tuple[object, ...]
        if is_wellness_only(query.metrics) and query.grain is MetricSeriesGrain.DAILY:
            statement = wellness_statement(query.metrics)
            params = (
                sum_metric_keys(query.metrics),
                query.athlete_id,
                query.start,
                query.end,
                query.sport,
            )
        else:
            statement = batch_statement(query.grain)
            params = (
                sum_metric_keys(query.metrics),
                query.athlete_id,
                query.start,
                query.end,
                [metric.value for metric in query.metrics],
                query.sport,
                query.sport,
            )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(statement, params)
            rows = await cur.fetchall()
        grouped: dict[str, list[MetricSeriesRecord]] = {}
        for row in rows:
            metric = str(row["metric_key"])
            grouped.setdefault(metric, []).append(
                MetricSeriesRecord(
                    period=cast(date, row["period"]),
                    value=float(row["value"]),
                    samples=int(row["samples"]),
                )
            )
        return grouped
