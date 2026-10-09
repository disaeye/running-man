from __future__ import annotations

from psycopg import sql

from domain.metric_series import (
    MetricAggregation,
    MetricSeriesGrain,
    MetricSeriesQuery,
    MetricSeriesRecord,
    metric_series_definition,
)
from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class MetricSeriesRepo:
    async def fetch(self, query: MetricSeriesQuery) -> list[MetricSeriesRecord]:
        definition = metric_series_definition(query.metric)
        statement = _series_statement(query.grain, definition.aggregation)
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
                period=row["period"],
                value=float(row["value"]),
                samples=int(row["samples"]),
            )
            for row in rows
        ]


def _series_statement(grain: MetricSeriesGrain, aggregation: MetricAggregation) -> sql.Composed:
    function_name = _function_name(grain)
    period_column = _period_column(grain)
    value_expression = _value_expression(aggregation)
    sample_expression = _sample_expression(grain)
    return sql.SQL(
        """
        SELECT {period_column} AS period,
               {value_expression} AS value,
               {sample_expression} AS samples
        FROM {function_name}(%s, %s, %s)
        WHERE metric_key = %s
          AND (%s::text IS NULL OR sport = %s)
        GROUP BY {period_column}
        ORDER BY {period_column}
        """
    ).format(
        period_column=period_column,
        value_expression=value_expression,
        sample_expression=sample_expression,
        function_name=function_name,
    )


def _function_name(grain: MetricSeriesGrain) -> sql.Identifier:
    match grain:
        case MetricSeriesGrain.DAILY:
            return sql.Identifier("get_athlete_daily_facts")
        case MetricSeriesGrain.WEEKLY:
            return sql.Identifier("get_athlete_weekly_facts")


def _period_column(grain: MetricSeriesGrain) -> sql.Identifier:
    match grain:
        case MetricSeriesGrain.DAILY:
            return sql.Identifier("day")
        case MetricSeriesGrain.WEEKLY:
            return sql.Identifier("week_start")


def _value_expression(aggregation: MetricAggregation) -> sql.SQL:
    match aggregation:
        case MetricAggregation.SUM:
            return sql.SQL("SUM(value)::double precision")
        case MetricAggregation.AVG:
            return sql.SQL("AVG(value)::double precision")


def _sample_expression(grain: MetricSeriesGrain) -> sql.SQL:
    match grain:
        case MetricSeriesGrain.DAILY:
            return sql.SQL("COUNT(*)::integer")
        case MetricSeriesGrain.WEEKLY:
            return sql.SQL("SUM(points)::integer")
