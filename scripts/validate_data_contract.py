from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

import yaml

from data_contract_omh import documented_stream_keys
from data_contract_schema import (
    CONTRACT_FILES,
    EXPECTED_ALGORITHM_VERSIONS,
    EXPECTED_METRIC_UNITS,
    EXPECTED_WINDOWS,
    REQUIRED_FIELDS,
    VALID_AGGREGATIONS,
    VALID_CATEGORIES,
    VALID_READINESS_COLORS,
    VALID_READINESS_INTENSITIES,
    VALID_READINESS_LEVELS,
    VALID_ZONE_TONES,
)
SNAKE_CASE: Final = re.compile(r"^[a-z][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    path: str
    message: str


def load_contract(path: Path, file_name: str) -> list[dict[str, object]]:
    with (path / file_name).open(encoding="utf-8") as contract_file:
        parsed = yaml.safe_load(contract_file)
    if not isinstance(parsed, dict):
        return []
    entries = parsed.get(file_name.removesuffix(".yaml").replace("-", "_"), [])
    return entries if isinstance(entries, list) else []


def add(diagnostics: list[Diagnostic], code: str, path: str, message: str) -> None:
    diagnostics.append(Diagnostic(code=code, path=path, message=message))


def value(entry: dict[str, object], key: str) -> object | None:
    return entry.get(key)


def validate_entries(
    collection: str, entries: list[dict[str, object]], diagnostics: list[Diagnostic]
) -> None:
    if collection == "readiness_bands":
        validate_readiness_bands(entries, diagnostics)
        return
    seen_keys: set[str] = set()
    seen_labels: set[str] = set()
    for index, entry in enumerate(entries):
        entry_key = value(entry, "key")
        path = f"{collection}.{entry_key}" if isinstance(entry_key, str) else f"{collection}[{index}]"
        for field in REQUIRED_FIELDS[collection]:
            if field not in entry:
                add(diagnostics, "missing_field", f"{path}.{field}", "required field is missing")
        if not isinstance(entry_key, str) or not SNAKE_CASE.fullmatch(entry_key):
            add(diagnostics, "canonical_key", path, "canonical keys must be lower snake case")
            continue
        if entry_key in seen_keys:
            add(diagnostics, "duplicate_key", path, "canonical key must exist exactly once")
        seen_keys.add(entry_key)
        validate_metric_label(collection, entry, path, seen_labels, diagnostics)
        validate_range(entry, path, diagnostics)
        validate_metric_unit(collection, entry, path, diagnostics)
        validate_aliases(collection, entry, path, diagnostics)
        validate_category(entry, path, diagnostics)
        validate_zones(entry, path, diagnostics)
        validate_source(entry, path, diagnostics)


def validate_range(entry: dict[str, object], path: str, diagnostics: list[Diagnostic]) -> None:
    legal_range = value(entry, "legal_range")
    if legal_range is None:
        return
    if not isinstance(legal_range, dict):
        add(diagnostics, "legal_range", f"{path}.legal_range", "legal_range must be a mapping")
        return
    minimum = legal_range.get("minimum")
    maximum = legal_range.get("maximum")
    if not isinstance(minimum, int | float):
        add(diagnostics, "legal_range", f"{path}.legal_range.minimum", "minimum must be numeric")
    if not isinstance(maximum, int | float):
        add(diagnostics, "legal_range", f"{path}.legal_range.maximum", "maximum must be numeric")
    if isinstance(minimum, int | float) and isinstance(maximum, int | float) and minimum > maximum:
        add(diagnostics, "legal_range", f"{path}.legal_range", "range must have ordered numeric bounds")


def validate_metric_label(
    collection: str,
    entry: dict[str, object],
    path: str,
    seen_labels: set[str],
    diagnostics: list[Diagnostic],
) -> None:
    if collection != "metrics":
        return
    label = value(entry, "display_name")
    if isinstance(label, str) and label in seen_labels:
        add(diagnostics, "duplicate_label", f"{path}.display_name", "metric display name must exist once")
    if isinstance(label, str):
        seen_labels.add(label)


def validate_metric_unit(
    collection: str, entry: dict[str, object], path: str, diagnostics: list[Diagnostic]
) -> None:
    if collection != "metrics":
        return
    entry_key = value(entry, "key")
    if not isinstance(entry_key, str):
        return
    expected_unit = EXPECTED_METRIC_UNITS.get(entry_key)
    if expected_unit is not None and value(entry, "storage_unit") != expected_unit:
        add(
            diagnostics,
            "storage_unit",
            f"{path}.storage_unit",
            f"canonical storage unit for {entry_key} is {expected_unit}",
        )


def validate_aliases(
    collection: str, entry: dict[str, object], path: str, diagnostics: list[Diagnostic]
) -> None:
    if collection != "sources":
        return
    aliases = value(entry, "aliases")
    if aliases not in (None, []):
        add(diagnostics, "aliases", f"{path}.aliases", "aliases are accepted only at adapters")
    entry_key = value(entry, "key")
    adapter_aliases = value(entry, "adapter_only_aliases")
    if entry_key == "intervals.icu":
        add(diagnostics, "canonical_source", path, "use intervals_icu as the machine key")
    if entry_key == "intervals_icu" and adapter_aliases != ["intervals.icu"]:
        add(
            diagnostics,
            "adapter_alias",
            f"{path}.adapter_only_aliases",
            "Intervals.icu must be an adapter-only alias",
        )
def validate_category(entry: dict[str, object], path: str, diagnostics: list[Diagnostic]) -> None:
    category = value(entry, "category")
    if category is None:
        return
    if category not in VALID_CATEGORIES:
        add(
            diagnostics,
            "invalid_category",
            f"{path}.category",
            f"category must be one of {sorted(VALID_CATEGORIES)}",
        )


def validate_zones(entry: dict[str, object], path: str, diagnostics: list[Diagnostic]) -> None:
    zones = value(entry, "zones")
    if zones is None:
        return
    if not isinstance(zones, list) or not zones:
        add(diagnostics, "invalid_zones", f"{path}.zones", "zones must be a non-empty list")
        return
    prev_bound: float | None = None
    for i, zone in enumerate(zones):
        zone_path = f"{path}.zones[{i}]"
        if not isinstance(zone, dict):
            add(diagnostics, "invalid_zone", zone_path, "zone must be a mapping")
            continue
        tone = zone.get("tone")
        if tone not in VALID_ZONE_TONES:
            add(
                diagnostics,
                "invalid_zone_tone",
                f"{zone_path}.tone",
                f"tone must be one of {sorted(VALID_ZONE_TONES)}",
            )
        current_bound: float | None = None
        has_min = "min" in zone and isinstance(zone["min"], int | float)
        has_max = "max" in zone and isinstance(zone["max"], int | float)
        if has_max:
            current_bound = float(zone["max"])
        elif has_min:
            current_bound = float(zone["min"])
        if prev_bound is not None and current_bound is not None:
            if has_min:
                # Open-ended zone (min-only) must share boundary with previous max
                if current_bound != prev_bound:
                    add(
                        diagnostics,
                        "zone_discontinuity",
                        zone_path,
                        f"zone min boundary {current_bound} must equal previous {prev_bound}",
                    )
            elif current_bound <= prev_bound:
                add(
                    diagnostics,
                    "zone_discontinuity",
                    zone_path,
                    f"zone boundary {current_bound} must be strictly greater than previous {prev_bound}",
                )
        if current_bound is not None:
            prev_bound = current_bound


def validate_source(entry: dict[str, object], path: str, diagnostics: list[Diagnostic]) -> None:
    source = value(entry, "source")
    if source is None:
        return
    if not isinstance(source, dict):
        add(diagnostics, "invalid_source", f"{path}.source", "source must be a mapping")
        return
    table = source.get("table")
    column = source.get("column")
    aggregation = source.get("aggregation")
    if not isinstance(table, str) or not table:
        add(diagnostics, "invalid_source_table", f"{path}.source.table", "table must be a non-empty string")
    if not isinstance(column, str) or not column:
        add(diagnostics, "invalid_source_column", f"{path}.source.column", "column must be a non-empty string")
    if aggregation not in VALID_AGGREGATIONS:
        add(
            diagnostics,
            "invalid_aggregation",
            f"{path}.source.aggregation",
            f"aggregation must be one of {sorted(VALID_AGGREGATIONS)}",
        )


def validate_readiness_bands(entries: list[dict[str, object]], diagnostics: list[Diagnostic]) -> None:
    seen_levels: set[str] = set()
    prev_min: int | None = None
    for index, entry in enumerate(entries):
        level = value(entry, "level")
        path = f"readiness_bands.{level}" if isinstance(level, str) else f"readiness_bands[{index}]"
        for field in REQUIRED_FIELDS["readiness_bands"]:
            if field not in entry:
                add(diagnostics, "missing_field", f"{path}.{field}", "required field is missing")
        if isinstance(level, str):
            if level not in VALID_READINESS_LEVELS:
                add(
                    diagnostics,
                    "invalid_level",
                    path,
                    f"level must be one of {sorted(VALID_READINESS_LEVELS)}",
                )
            if level in seen_levels:
                add(diagnostics, "duplicate_level", path, "readiness level must exist exactly once")
            seen_levels.add(level)
        color = value(entry, "color")
        if isinstance(color, str) and color not in VALID_READINESS_COLORS:
            add(
                diagnostics,
                "invalid_color",
                f"{path}.color",
                f"color must be one of {sorted(VALID_READINESS_COLORS)}",
            )
        intensity = value(entry, "max_intensity")
        if isinstance(intensity, str) and intensity not in VALID_READINESS_INTENSITIES:
            add(
                diagnostics,
                "invalid_intensity",
                f"{path}.max_intensity",
                f"max_intensity must be one of {sorted(VALID_READINESS_INTENSITIES)}",
            )
        min_score = value(entry, "min_score")
        if not isinstance(min_score, int):
            add(diagnostics, "invalid_min_score", f"{path}.min_score", "min_score must be an integer")
        elif prev_min is not None and min_score >= prev_min:
            add(
                diagnostics,
                "bands_not_descending",
                path,
                f"min_score {min_score} must be strictly less than previous {prev_min}",
            )
        if isinstance(min_score, int):
            prev_min = min_score


def validate_algorithms(entries: list[dict[str, object]], diagnostics: list[Diagnostic]) -> dict[str, int]:
    input_windows: dict[str, int] = {}
    by_key = {entry.get("key"): entry for entry in entries}
    for key, expected_version in EXPECTED_ALGORITHM_VERSIONS.items():
        entry = by_key.get(key)
        path = f"algorithms.{key}"
        if not isinstance(entry, dict):
            add(diagnostics, "required_algorithm", path, "required algorithm is missing")
            continue
        if entry.get("version") != expected_version:
            add(diagnostics, "algorithm_version", f"{path}.version", f"version must be {expected_version}")
        window = entry.get("input_window_days")
        if not isinstance(window, int) or window <= 0:
            add(diagnostics, "input_window_days", f"{path}.input_window_days", "must be a positive integer")
        elif key != "physiology":
            input_windows[key] = window
    physiology = by_key.get("physiology")
    if isinstance(physiology, dict):
        calculations = physiology.get("calculations")
        if isinstance(calculations, list):
            for calculation in calculations:
                if not isinstance(calculation, dict):
                    continue
                calculation_key = calculation.get("key")
                window = calculation.get("input_window_days")
                if calculation_key in {"hr_max", "lthr", "threshold_pace"}:
                    path = f"algorithms.physiology.calculations.{calculation_key}.input_window_days"
                    if not isinstance(window, int) or window <= 0:
                        add(diagnostics, "input_window_days", path, "must be a positive integer")
                    else:
                        input_windows[calculation_key] = window
        else:
            add(diagnostics, "calculations", "algorithms.physiology.calculations", "must be a list")
    for key, expected_window in EXPECTED_WINDOWS.items():
        if input_windows.get(key) != expected_window:
            add(
                diagnostics,
                "input_window_days",
                f"algorithms.{key}.input_window_days",
                f"version 1 window must be {expected_window} days",
            )
    return {key: input_windows[key] for key in EXPECTED_WINDOWS if key in input_windows}


def validate_omh_coverage(
    root: Path, entries: list[dict[str, object]], diagnostics: list[Diagnostic]
) -> dict[str, object]:
    documented = documented_stream_keys(root)
    keys = [entry.get("key") for entry in entries]
    missing = sorted(key for key in documented if keys.count(key) == 0)
    duplicates = sorted(key for key in documented if keys.count(key) > 1)
    for key in missing:
        add(diagnostics, "omh_stream_coverage", f"stream_metrics.{key}", "documented OMH stream is missing")
    for key in duplicates:
        add(diagnostics, "omh_stream_duplicate", f"stream_metrics.{key}", "documented OMH stream must exist once")
    return {
        "documented": len(documented),
        "contract_entries": len(entries),
        "missing": missing,
        "duplicates": duplicates,
    }


def validate(contract_directory: Path) -> dict[str, object]:
    root = Path(__file__).resolve().parents[1]
    diagnostics: list[Diagnostic] = []
    contracts: dict[str, list[dict[str, object]]] = {}
    for collection, file_name in CONTRACT_FILES.items():
        contract_path = contract_directory / file_name
        if not contract_path.is_file():
            add(diagnostics, "missing_file", file_name, "required contract file is missing")
            contracts[collection] = []
            continue
        contracts[collection] = load_contract(contract_directory, file_name)
        validate_entries(collection, contracts[collection], diagnostics)
    input_windows = validate_algorithms(contracts["algorithms"], diagnostics)
    coverage = validate_omh_coverage(root, contracts["stream_metrics"], diagnostics)
    diagnostics.sort(key=lambda diagnostic: (diagnostic.path, diagnostic.code))
    return {
        "contract_version": 1,
        "ok": not diagnostics,
        "diagnostics": [asdict(diagnostic) for diagnostic in diagnostics],
        "input_window_days": dict(sorted(input_windows.items())),
        "omh_stream_coverage": coverage,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract_directory", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    report = validate(arguments.contract_directory)
    if arguments.as_json:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("valid" if report["ok"] else "invalid")
        for diagnostic in report["diagnostics"]:
            print(f"{diagnostic['path']}: {diagnostic['message']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
