"""Aggregate work-segment physiological domains for weekly views.

The five-object session classification stores per-work-segment time in four
ACSM/ESSA domains. Weekly load, plan quality and trend views read the same
numbers through this module so their intensity vocabulary stays identical.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from typing import Final, TypedDict, cast

DOMAIN_KEYS: Final[tuple[str, ...]] = (
    "below_mt1",
    "mt1_mt2",
    "mt2_wmax",
    "above_wmax",
    "low_unspecified",
)


class DomainSeconds(TypedDict):
    below_mt1: float
    mt1_mt2: float
    mt2_wmax: float
    above_wmax: float
    low_unspecified: float


def empty_domain_seconds() -> DomainSeconds:
    return DomainSeconds(
        below_mt1=0.0,
        mt1_mt2=0.0,
        mt2_wmax=0.0,
        above_wmax=0.0,
        low_unspecified=0.0,
    )


def session_domain_seconds(row: Mapping[str, object]) -> DomainSeconds:
    """Read one persisted quality object and return work seconds per domain."""
    result = empty_domain_seconds()
    quality = row.get("quality")
    if not isinstance(quality, Mapping):
        return result
    residence = quality.get("work_domain_residence_s")
    if not isinstance(residence, Mapping):
        return result
    result["below_mt1"] = _positive(residence.get("below_mt1"))
    result["mt1_mt2"] = _positive(residence.get("mt1_mt2"))
    result["mt2_wmax"] = _positive(residence.get("mt2_wmax"))
    result["above_wmax"] = _positive(residence.get("above_wmax"))
    result["low_unspecified"] = _positive(residence.get("low_unspecified"))
    return result


def aggregate_domain_seconds(rows: Iterable[Mapping[str, object]]) -> DomainSeconds:
    result = empty_domain_seconds()
    for row in rows:
        values = session_domain_seconds(row)
        result["below_mt1"] += values["below_mt1"]
        result["mt1_mt2"] += values["mt1_mt2"]
        result["mt2_wmax"] += values["mt2_wmax"]
        result["above_wmax"] += values["above_wmax"]
        result["low_unspecified"] += values["low_unspecified"]
    for key in DOMAIN_KEYS:
        if key == "below_mt1":
            result["below_mt1"] = round(result["below_mt1"], 1)
        elif key == "mt1_mt2":
            result["mt1_mt2"] = round(result["mt1_mt2"], 1)
        elif key == "mt2_wmax":
            result["mt2_wmax"] = round(result["mt2_wmax"], 1)
        elif key == "above_wmax":
            result["above_wmax"] = round(result["above_wmax"], 1)
        else:
            result["low_unspecified"] = round(result["low_unspecified"], 1)
    return result


def weekly_domain_seconds(
    rows: Iterable[Mapping[str, object]],
) -> list[dict[str, object]]:
    """Group persisted sessions by the Monday of their stored local day."""
    grouped: dict[date, list[Mapping[str, object]]] = {}
    for row in rows:
        value = row.get("local_day")
        if isinstance(value, date):
            day = value
        elif isinstance(value, str):
            day = date.fromisoformat(value[:10])
        else:
            raise ValueError("session classification has no local_day")
        monday = day - timedelta(days=day.weekday())
        grouped.setdefault(monday, []).append(row)
    return [
        {
            "week_start": week,
            "work_domain_seconds": aggregate_domain_seconds(group_rows),
            "classification_count": len(group_rows),
        }
        for week, group_rows in sorted(grouped.items())
    ]


def domain_seconds_by_week(
    rows: Iterable[Mapping[str, object]],
) -> dict[date, DomainSeconds]:
    """Weekly work-domain totals keyed by the Monday of each stored local day."""
    result: dict[date, DomainSeconds] = {}
    for row in weekly_domain_seconds(rows):
        value = row["week_start"]
        day = value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
        result[day] = cast("DomainSeconds", row["work_domain_seconds"])
    return result


def domain_share(seconds: Mapping[str, object]) -> dict[str, float]:
    total = sum(_positive(seconds.get(key)) for key in DOMAIN_KEYS)
    if total <= 0:
        return {key: 0.0 for key in DOMAIN_KEYS}
    return {key: round(_positive(seconds.get(key)) / total, 4) for key in DOMAIN_KEYS}


def _positive(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        return 0.0
    return float(value)
