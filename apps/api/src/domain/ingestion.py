from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Literal, TypeAlias, assert_never, cast

from domain.generated.metrics import METRIC_DEFINITIONS
from domain.generated.sources import SOURCE_DEFINITIONS
from domain.generated.sports import SPORT_DEFINITIONS
from domain.generated.stream_metrics import STREAM_METRIC_DEFINITIONS


class DistanceUnit(StrEnum):
    M = "m"
    KM = "km"


SourceRecordStatus: TypeAlias = Literal["active", "rejected", "ignored"]


@dataclass(slots=True)
class IngestionError(Exception):
    # Not frozen: CPython assigns __traceback__/__context__; frozen masks the
    # real error as TypeError.
    error_code: str
    message: str
    source_record_id: str | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True, slots=True)
class RejectedSourceRecord:
    source: str
    entity_type: str
    source_record_id: str
    raw_payload: Mapping[str, object]
    error_code: str
    message: str
    activity_id: str | None = None
    status: SourceRecordStatus = "rejected"


_SOURCE_ALIASES: Final = {
    alias: str(row["key"])
    for row in cast(tuple[Mapping[str, object], ...], tuple(SOURCE_DEFINITIONS))
    for alias in (str(row["key"]), *cast(list[str], row["adapter_only_aliases"]))
}
_SPORT_ALIASES: Final = {
    alias: str(row["key"])
    for row in cast(tuple[Mapping[str, object], ...], tuple(SPORT_DEFINITIONS))
    for alias in (str(row["key"]), *cast(list[str], row["aliases"]))
}
_STREAM_ALIASES: Final = {
    alias: str(row["key"])
    for row in cast(tuple[Mapping[str, object], ...], tuple(STREAM_METRIC_DEFINITIONS))
    for alias in (str(row["key"]), *cast(list[str], row["adapter_only_aliases"]))
}
_STREAM_RANGES: Final = {
    str(row["key"]): cast(Mapping[str, int | float], row["legal_range"])
    for row in cast(tuple[Mapping[str, object], ...], tuple(STREAM_METRIC_DEFINITIONS))
}
_METRIC_RANGES: Final = {
    str(row["key"]): cast(Mapping[str, int | float], row["legal_range"])
    for row in cast(tuple[Mapping[str, object], ...], tuple(METRIC_DEFINITIONS))
}
_SUMMARY_METRICS: Final = {
    "distance_m": "distance_m",
    "duration_s": "duration_s",
    "avg_hr": "avg_hr",
    "max_hr": "avg_hr",
    "avg_power": "source_weighted_power_w",
    "source_weighted_power_w": "source_weighted_power_w",
    "icu_ctl": "ctl",
    "source_training_load": "source_training_load",
}


def canonical_source(raw: object) -> str:
    key = _SOURCE_ALIASES.get(str(raw))
    if key is None:
        raise IngestionError("unknown_source", f"unknown activity source: {raw}")
    return key


def canonical_sport(raw: object) -> str:
    key = _SPORT_ALIASES.get(str(raw))
    if key is None:
        raise IngestionError("unknown_sport", f"unknown activity sport: {raw}")
    return key


def canonical_stream_metric(raw: object) -> str:
    key = _STREAM_ALIASES.get(str(raw))
    if key is None:
        raise IngestionError("unknown_stream_metric", f"unknown stream metric: {raw}")
    return key


def canonical_distance(value: object, unit: DistanceUnit) -> float | None:
    distance = number_or_none(value)
    if distance is None:
        return None
    match unit:
        case DistanceUnit.M:
            meters = distance
        case DistanceUnit.KM:
            meters = distance * 1000
        case _ as unreachable:
            assert_never(unreachable)
    _require_range("distance_m", meters)
    return meters


def canonical_summary(summary: Mapping[str, object]) -> dict[str, object]:
    source = canonical_source(summary.get("source"))
    sport = canonical_sport(summary.get("sport"))
    distance = canonical_distance(summary.get("distance_m"), DistanceUnit.M)
    normalized = dict(summary)
    normalized["source"] = source
    normalized["sport"] = sport
    normalized["distance_m"] = distance
    for field, metric_key in _SUMMARY_METRICS.items():
        _require_optional_range(metric_key, normalized.get(field))
    return normalized


def canonical_stream(stream: Mapping[str, object]) -> dict[str, object]:
    metric_type = canonical_stream_metric(stream.get("metric_type"))
    value = number_or_none(stream.get("value"))
    if value is None:
        raise IngestionError("invalid_stream_value", f"missing stream value for {metric_type}")
    _require_stream_range(metric_type, value)
    normalized = dict(stream)
    normalized["metric_type"] = metric_type
    normalized["value"] = value
    return normalized


def number_or_none(value: object) -> float | None:
    return float(value) if isinstance(value, int | float | str) and value != "" else None


def _require_optional_range(metric_key: str, value: object) -> None:
    numeric = number_or_none(value)
    if numeric is not None:
        _require_range(metric_key, numeric)


def _require_stream_range(metric_key: str, value: float) -> None:
    legal_range = _STREAM_RANGES[metric_key]
    if not float(legal_range["minimum"]) <= value <= float(legal_range["maximum"]):
        raise IngestionError(
            "stream_value_out_of_range",
            f"stream {metric_key} value {value:g} outside legal range",
        )


def _require_range(metric_key: str, value: float) -> None:
    legal_range = _METRIC_RANGES[metric_key]
    if not float(legal_range["minimum"]) <= value <= float(legal_range["maximum"]):
        raise IngestionError(
            "metric_value_out_of_range",
            f"metric {metric_key} value {value:g} outside legal range",
        )
