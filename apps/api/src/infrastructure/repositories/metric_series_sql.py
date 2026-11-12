"""SQL builders for the metric-series repository."""

from __future__ import annotations

from typing import Any, cast

from psycopg import sql

from domain.generated.metrics import METRIC_DEFINITIONS, Metric
from domain.metric_series import (
    MetricAggregation,
    MetricSeriesGrain,
    metric_series_definition,
)

_METRIC_ROWS: dict[str, dict[str, Any]] = {
    str(row["key"]): cast(dict[str, Any], row) for row in METRIC_DEFINITIONS
}


def _source(row: dict[str, Any]) -> dict[str, Any]:
    return cast(dict[str, Any], row.get("source", {}))


WELLNESS_COLUMNS: dict[Metric, str] = {
    metric: str(_source(row)["column"])
    for metric in Metric
    if (row := _METRIC_ROWS.get(metric.value))
    and _source(row).get("table") == "health_wellness"
    and isinstance(_source(row).get("column"), str)
}


def is_wellness_only(metrics: tuple[Metric, ...]) -> bool:
    return bool(metrics) and all(metric in WELLNESS_COLUMNS for metric in metrics)


def sum_metric_keys(metrics: tuple[Metric, ...]) -> list[str]:
    return [
        metric.value
        for metric in metrics
        if metric_series_definition(metric).aggregation is MetricAggregation.SUM
    ]


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


def _sample_expression(grain: MetricSeriesGrain) -> sql.SQL:
    match grain:
        case MetricSeriesGrain.DAILY:
            return sql.SQL("COUNT(*)::integer")
        case MetricSeriesGrain.WEEKLY:
            return sql.SQL("SUM(points)::integer")


def _value_expression(aggregation: MetricAggregation) -> sql.SQL:
    match aggregation:
        case MetricAggregation.SUM:
            return sql.SQL("SUM(value)::double precision")
        case MetricAggregation.AVG:
            return sql.SQL("AVG(value)::double precision")


def series_statement(grain: MetricSeriesGrain, aggregation: MetricAggregation) -> sql.Composed:
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
        period_column=_period_column(grain),
        value_expression=_value_expression(aggregation),
        sample_expression=_sample_expression(grain),
        function_name=_function_name(grain),
    )


def batch_statement(grain: MetricSeriesGrain) -> sql.Composed:
    """One statement for every requested metric, keyed by metric_key."""
    return sql.SQL(
        """
        SELECT metric_key, {period_column} AS period,
               CASE WHEN metric_key = ANY(%s)
                    THEN SUM(value)::double precision
                    ELSE AVG(value)::double precision END AS value,
               {sample_expression} AS samples
        FROM {function_name}(%s, %s, %s)
        WHERE metric_key = ANY(%s)
          AND (%s::text IS NULL OR sport = %s)
        GROUP BY metric_key, {period_column}
        ORDER BY metric_key, {period_column}
        """
    ).format(
        period_column=_period_column(grain),
        sample_expression=_sample_expression(grain),
        function_name=_function_name(grain),
    )


def wellness_statement(metrics: tuple[Metric, ...]) -> sql.Composed:
    """Read daily wellness metrics straight from their source table.

    ``get_athlete_daily_facts`` joins four fact sources for every call. The
    wellness metrics all live in one table, so unpivoting only the requested
    columns avoids planning the activity and derived-fact partitions. The
    metric-definition and sport gates reproduce the fact function's semantics.
    """
    values = sql.SQL(", ").join(
        sql.SQL("({key}::text, h.{column}::double precision)").format(
            key=sql.Literal(metric.value),
            column=sql.Identifier(WELLNESS_COLUMNS[metric]),
        )
        for metric in metrics
    )
    return sql.SQL(
        """
        SELECT v.metric_key, h.day AS period,
               CASE WHEN v.metric_key = ANY(%s)
                    THEN SUM(v.value)::double precision
                    ELSE AVG(v.value)::double precision END AS value,
               COUNT(*)::integer AS samples
        FROM health_wellness AS h
        CROSS JOIN LATERAL (VALUES {values}) AS v(metric_key, value)
        JOIN current_metric_definitions AS m ON m.metric_key = v.metric_key
        WHERE h.athlete_id = %s AND h.day BETWEEN %s AND %s
          AND %s::text IS NULL
          AND v.value IS NOT NULL
        GROUP BY v.metric_key, h.day
        ORDER BY v.metric_key, h.day
        """
    ).format(values=values)
