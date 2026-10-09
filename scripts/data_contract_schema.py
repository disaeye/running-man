from __future__ import annotations

from typing import Final


CONTRACT_FILES: Final = {
    "sources": "sources.yaml",
    "sports": "sports.yaml",
    "stream_metrics": "stream-metrics.yaml",
    "metrics": "metrics.yaml",
    "algorithms": "algorithms.yaml",
    "readiness_bands": "readiness-bands.yaml",
}
REQUIRED_FIELDS: Final = {
    "sources": ("key", "display_name", "aliases", "adapter_only_aliases", "input_metrics"),
    "sports": ("key", "display_name", "aliases", "family"),
    "stream_metrics": (
        "key",
        "storage_unit",
        "display_unit",
        "null_semantics",
        "legal_range",
        "adapter_only_aliases",
    ),
    "metrics": (
        "key",
        "display_name",
        "classification",
        "category",
        "storage_unit",
        "display_unit",
        "null_semantics",
        "legal_range",
        "materialization",
        "ui_precision",
    ),
    "algorithms": ("key", "version", "input_window_days", "materialization", "outputs"),
    "readiness_bands": ("min_score", "level", "label", "max_intensity", "color", "recommendation"),
}
EXPECTED_ALGORITHM_VERSIONS: Final = {
    "activity_load": "1.0.0",
    "pmc": "1.0.0",
    "physiology": "1.0.0",
}
EXPECTED_METRIC_UNITS: Final = {
    "distance_m": "m",
    "duration_s": "s",
    "threshold_pace": "s_km",
}
EXPECTED_WINDOWS: Final = {
    "hr_max": 730,
    "lthr": 365,
    "threshold_pace": 365,
}
VALID_CATEGORIES: Final = frozenset({
    "volume",
    "load",
    "load_balance",
    "recovery",
    "wellness_input",
    "ability",
    "body",
    "intensity",
    "environment",
})
VALID_AGGREGATIONS: Final = frozenset({"sum", "avg", "latest", "max"})
VALID_ZONE_TONES: Final = frozenset({"safe", "caution", "danger", "neutral"})
VALID_READINESS_COLORS: Final = frozenset({"good", "moderate", "poor"})
VALID_READINESS_LEVELS: Final = frozenset({"high", "moderate", "recovery", "rest"})
VALID_READINESS_INTENSITIES: Final = frozenset({"high", "moderate", "low", "none"})
