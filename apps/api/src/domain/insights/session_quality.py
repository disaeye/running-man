"""Shared per-session quality summary from the stored five-object result.

Adherence, planned/actual matching, plan quality and weekly trends all consume
the same three numbers: whether the session type, structure and physiological
domain agreed with the plan. This is the common data definition required when a
plan is compared with a completed activity.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import TypedDict


class QualityMatches(TypedDict):
    type_match: float | None
    structure_match: float | None
    domain_match: float | None


def empty_quality_matches() -> QualityMatches:
    return {"type_match": None, "structure_match": None, "domain_match": None}


def quality_matches(rows: Iterable[Mapping[str, object]]) -> QualityMatches:
    """Mean per-session quality agreement over stored classification objects."""
    values: dict[str, list[float]] = {
        "type_match": [],
        "structure_match": [],
        "domain_match": [],
    }
    for row in rows:
        quality = row.get("quality")
        if not isinstance(quality, Mapping):
            continue
        for key, source in (
            ("type_match", "repetition_match"),
            ("structure_match", "structure_match"),
            ("domain_match", "work_distance_match"),
        ):
            number = _ratio(quality.get(source))
            if number is not None:
                values[key].append(number)
    return QualityMatches(
        type_match=_mean(values["type_match"]),
        structure_match=_mean(values["structure_match"]),
        domain_match=_mean(values["domain_match"]),
    )


def _ratio(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return min(max(float(value), 0.0), 1.0)


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None
