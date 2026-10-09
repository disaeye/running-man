from __future__ import annotations

import json
from collections.abc import Mapping
from typing import cast

from domain.generated.metrics import METRIC_DEFINITIONS
from domain.generated.sources import SOURCE_DEFINITIONS
from domain.generated.sports import SPORT_DEFINITIONS
from domain.generated.stream_metrics import STREAM_METRIC_DEFINITIONS


def source_rows() -> list[dict[str, str]]:
    return [
        {
            "key": str(row["key"]),
            "display_name": str(row["display_name"]),
            "aliases": json.dumps(row["aliases"]),
            "adapter_only_aliases": json.dumps(row["adapter_only_aliases"]),
            "input_metrics": json.dumps(row["input_metrics"]),
        }
        for row in SOURCE_DEFINITIONS
    ]


def sport_rows() -> list[dict[str, str]]:
    return [
        {
            "key": str(row["key"]),
            "display_name": str(row["display_name"]),
            "family": str(row["family"]),
            "aliases": json.dumps(row["aliases"]),
        }
        for row in SPORT_DEFINITIONS
    ]


def stream_rows() -> list[dict[str, str | float]]:
    return [
        {
            "key": str(row["key"]),
            "unit": str(row["storage_unit"]),
            "display_unit": str(row["display_unit"]),
            "null_semantics": str(row["null_semantics"]),
            "legal_min": _range_value(row, "minimum"),
            "legal_max": _range_value(row, "maximum"),
            "adapter_only_aliases": json.dumps(row["adapter_only_aliases"]),
        }
        for row in STREAM_METRIC_DEFINITIONS
    ]


def metric_rows() -> list[dict[str, str | float | int | None]]:
    rows: list[dict[str, str | float | int | None]] = []
    for row in METRIC_DEFINITIONS:
        source = row.get("source")
        entry: dict[str, str | float | int | None] = {
            "key": str(row["key"]),
            "unit": str(row["storage_unit"]),
            "display_name": str(row.get("display_name", "")),
            "display_unit": str(row["display_unit"]),
            "classification": str(row["classification"]),
            "category": str(row.get("category", "")),
            "materialization": str(row["materialization"]),
            "null_semantics": str(row["null_semantics"]),
            "legal_min": _range_value(row, "minimum"),
            "legal_max": _range_value(row, "maximum"),
            "ui_precision": int(cast(int, row["ui_precision"])),
            "zones": json.dumps(row.get("zones", [])),
            "note": str(row.get("note", "")),
            "source_table": str(source["table"]) if isinstance(source, dict) else None,
            "source_column": str(source["column"]) if isinstance(source, dict) else None,
            "aggregation": str(source["aggregation"]) if isinstance(source, dict) else None,
        }
        rows.append(entry)
    return rows


def _range_value(row: Mapping[str, object], key: str) -> float:
    legal_range = cast(Mapping[str, int | float], row["legal_range"])
    return float(legal_range[key])
