"""Perceived-exertion evidence extracted from the activity summary and raw payload."""

from __future__ import annotations

from typing import Final

MIN_RPE: Final = 1.0
MAX_RPE: Final = 10.0

RPE_FIELDS: Final[tuple[str, ...]] = (
    "session_rpe",
    "icu_rpe",
    "perceived_exertion",
    "rpe",
)


def subjective_rpe(summary_value: object, raw: dict[str, object]) -> float | None:
    """Return a CR10 value from the first available source, or None."""
    for value in (summary_value, *(raw.get(key) for key in RPE_FIELDS)):
        number = _number(value)
        if number is not None and MIN_RPE <= number <= MAX_RPE:
            return number
    return None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
