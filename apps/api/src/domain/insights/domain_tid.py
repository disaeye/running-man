from collections.abc import Mapping
from typing import Final, Literal

from domain.insights.plan_intensity import (
    INTENSITY_DISTRIBUTION_WEIGHT,
    MAX_HIGH_INTENSITY_TIME_SHARE,
    MIN_LOW_INTENSITY_TIME_SHARE,
)

DistributionType = Literal["polarized", "pyramidal", "threshold", "high-volume"]

POLARIZED_LOW_MIN: Final = 75.0
POLARIZED_HIGH_MIN: Final = 15.0
POLARIZED_MID_MAX: Final = 10.0
HIGH_VOLUME_LOW_MIN: Final = 80.0
THRESHOLD_MID_MIN: Final = 35.0


def domain_percentages(seconds: Mapping[str, object]) -> dict[str, float] | None:
    low = _positive(seconds.get("below_mt1")) + _positive(seconds.get("low_unspecified"))
    mid = _positive(seconds.get("mt1_mt2"))
    high = _positive(seconds.get("mt2_wmax")) + _positive(seconds.get("above_wmax"))
    total = low + mid + high
    if total <= 0:
        return None
    return {
        "low": low / total * 100.0,
        "mid": mid / total * 100.0,
        "high": high / total * 100.0,
    }


def classify_domain_distribution(
    seconds: Mapping[str, object],
) -> DistributionType | None:
    percentages = domain_percentages(seconds)
    if percentages is None:
        return None
    low = percentages["low"]
    mid = percentages["mid"]
    high = percentages["high"]
    if low >= HIGH_VOLUME_LOW_MIN:
        return "high-volume"
    if low > POLARIZED_LOW_MIN and high > POLARIZED_HIGH_MIN and mid < POLARIZED_MID_MAX:
        return "polarized"
    if mid >= THRESHOLD_MID_MIN or mid >= high:
        return "threshold"
    if low > mid > high:
        return "pyramidal"
    return "polarized" if high > POLARIZED_HIGH_MIN else "high-volume"


def domain_intensity_score(seconds: Mapping[str, object]) -> float | None:
    """Plan-quality intensity score from measured ACSM/ESSA domain time."""
    percentages = domain_percentages(seconds)
    if percentages is None:
        return None
    low_ratio = percentages["low"] / 100.0
    high_ratio = (percentages["mid"] + percentages["high"]) / 100.0
    low_score = min(low_ratio / MIN_LOW_INTENSITY_TIME_SHARE, 1.0) * 0.6
    high_score = (1.0 if high_ratio <= MAX_HIGH_INTENSITY_TIME_SHARE else 0.5) * 0.4
    return (low_score + high_score) * INTENSITY_DISTRIBUTION_WEIGHT


def classify_by_zone(by_zone: Mapping[str, float]) -> DistributionType:
    """Five-zone fallback used when no stored physiological domains exist."""
    total = sum(by_zone.values())
    if total <= 0:
        return "high-volume"
    low = (by_zone.get("z1", 0.0) + by_zone.get("z2", 0.0)) / total * 100.0
    mid = by_zone.get("z3", 0.0) / total * 100.0
    high = (by_zone.get("z4", 0.0) + by_zone.get("z5", 0.0)) / total * 100.0
    if low > POLARIZED_LOW_MIN and high > POLARIZED_HIGH_MIN:
        return "polarized"
    if low >= HIGH_VOLUME_LOW_MIN:
        return "high-volume"
    if mid >= THRESHOLD_MID_MIN or by_zone.get("z4", 0.0) >= by_zone.get("z2", 0.0):
        return "threshold"
    return "pyramidal"


def classify_weekly_distribution(
    by_zone: Mapping[str, float], seconds: Mapping[str, object]
) -> DistributionType:
    """Prefer measured ACSM/ESSA domains; fall back to five-zone time."""
    classified = classify_domain_distribution(seconds)
    return classified if classified is not None else classify_by_zone(by_zone)


def _positive(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        return 0.0
    return float(value)
