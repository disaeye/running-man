"""Shared per-segment load definition for every trend consumer.

The five-object classification is the single source for weekly load, plan
quality, intensity distribution, coach context, adherence and matching. This
module reads the ``execution.segments`` rows once and exposes the same work
distance, work duration, bout count and domain seconds to all of them. TSS and
the five-zone heart-rate histogram remain display fallbacks for accounts with
no stored classifications.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from typing import TypedDict

from domain.insights.session_domains import DomainSeconds, session_domain_seconds
from domain.insights.session_quality import QualityMatches, quality_matches


class SessionLoadFacts(TypedDict):
    work_bouts: int
    work_distance_m: float
    work_duration_s: float
    domain_seconds: DomainSeconds
    quality_matches: QualityMatches


def empty_session_load_facts() -> SessionLoadFacts:
    return {
        "work_bouts": 0,
        "work_distance_m": 0.0,
        "work_duration_s": 0.0,
        "domain_seconds": {
            "below_mt1": 0.0,
            "mt1_mt2": 0.0,
            "mt2_wmax": 0.0,
            "above_wmax": 0.0,
            "low_unspecified": 0.0,
        },
        "quality_matches": {
            "type_match": None,
            "structure_match": None,
            "domain_match": None,
        },
    }


def session_load_facts(row: Mapping[str, object]) -> SessionLoadFacts:
    """Read one persisted five-object result."""
    result = empty_session_load_facts()
    execution = row.get("execution")
    if isinstance(execution, Mapping):
        segments = execution.get("segments")
        if isinstance(segments, list):
            for segment in segments:
                if not isinstance(segment, Mapping) or segment.get("role") != "work":
                    continue
                measured = segment.get("measured")
                values = measured if isinstance(measured, Mapping) else segment
                result["work_bouts"] += 1
                result["work_distance_m"] += _number(values.get("distance_m"))
                result["work_duration_s"] += _number(values.get("duration_s"))
    result["work_distance_m"] = round(result["work_distance_m"], 1)
    result["work_duration_s"] = round(result["work_duration_s"], 1)
    result["domain_seconds"] = session_domain_seconds(row)
    result["quality_matches"] = quality_matches([row])
    return result


def aggregate_session_load(
    rows: Iterable[Mapping[str, object]],
) -> SessionLoadFacts:
    """Aggregate the shared facts over many classifications."""
    total = empty_session_load_facts()
    type_values: list[float] = []
    structure_values: list[float] = []
    domain_values: list[float] = []
    for row in rows:
        facts = session_load_facts(row)
        total["work_bouts"] += facts["work_bouts"]
        total["work_distance_m"] += facts["work_distance_m"]
        total["work_duration_s"] += facts["work_duration_s"]
        domains = total["domain_seconds"]
        domains["below_mt1"] += facts["domain_seconds"]["below_mt1"]
        domains["mt1_mt2"] += facts["domain_seconds"]["mt1_mt2"]
        domains["mt2_wmax"] += facts["domain_seconds"]["mt2_wmax"]
        domains["above_wmax"] += facts["domain_seconds"]["above_wmax"]
        domains["low_unspecified"] += facts["domain_seconds"]["low_unspecified"]
        matches = facts["quality_matches"]
        for value, bucket in (
            (matches["type_match"], type_values),
            (matches["structure_match"], structure_values),
            (matches["domain_match"], domain_values),
        ):
            if value is not None:
                bucket.append(value)
    total["work_distance_m"] = round(total["work_distance_m"], 1)
    total["work_duration_s"] = round(total["work_duration_s"], 1)
    for key in ("below_mt1", "mt1_mt2", "mt2_wmax", "above_wmax", "low_unspecified"):
        if key == "below_mt1":
            total["domain_seconds"]["below_mt1"] = round(total["domain_seconds"]["below_mt1"], 1)
        elif key == "mt1_mt2":
            total["domain_seconds"]["mt1_mt2"] = round(total["domain_seconds"]["mt1_mt2"], 1)
        elif key == "mt2_wmax":
            total["domain_seconds"]["mt2_wmax"] = round(total["domain_seconds"]["mt2_wmax"], 1)
        elif key == "above_wmax":
            total["domain_seconds"]["above_wmax"] = round(total["domain_seconds"]["above_wmax"], 1)
        else:
            total["domain_seconds"]["low_unspecified"] = round(
                total["domain_seconds"]["low_unspecified"], 1
            )
    total["quality_matches"] = QualityMatches(
        type_match=_mean(type_values),
        structure_match=_mean(structure_values),
        domain_match=_mean(domain_values),
    )
    return total


def weekly_session_load(
    rows: Iterable[Mapping[str, object]],
) -> dict[str, SessionLoadFacts]:
    """Aggregate the shared per-segment facts by ISO week."""
    grouped: dict[str, list[Mapping[str, object]]] = {}
    for row in rows:
        grouped.setdefault(_iso_week(row), []).append(row)
    return {week: aggregate_session_load(items) for week, items in grouped.items()}


def _iso_week(row: Mapping[str, object]) -> str:
    value = row.get("local_day")
    day = value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
    monday = day - timedelta(days=day.weekday())
    year, week, _ = monday.isocalendar()
    return f"{year}-W{week:02d}"


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)
