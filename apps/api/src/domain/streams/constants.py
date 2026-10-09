"""Canonical stream metric names (our data dictionary).

All external sources (Intervals.icu, FIT/GPX/TCX uploads) map their
field names to these canonical names before writing to ``activity_streams``.
Downstream consumers (analysis, insights, frontend) only ever see these names.
"""

from typing import Final

from domain.generated.stream_metrics import STREAM_METRIC_ALIASES, StreamMetric

__all__ = ("StreamMetric", "canonicalize_metric")

INTERVALS_ICU_METRIC_MAP: Final = STREAM_METRIC_ALIASES
FIT_FILE_METRIC_MAP: Final = STREAM_METRIC_ALIASES


def canonicalize_metric(metric: str, source: str = "") -> str:
    """Return canonical metric name for a given external metric name.

    Unknown metrics are returned as-is; callers should validate them.
    """
    _ = source
    return STREAM_METRIC_ALIASES.get(metric, metric)
