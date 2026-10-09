from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from math import ceil, floor
from typing import Final, Literal, TypedDict, cast

DistributionType = Literal["polarized", "pyramidal", "threshold", "high-volume"]
MetricSource = Literal["heart_rate", "power", "summary"]

POLARIZED_LOW_MIN: Final = 75.0
POLARIZED_HIGH_MIN: Final = 15.0
HIGH_VOLUME_LOW_MIN: Final = 80.0
THRESHOLD_MID_MIN: Final = 35.0

HR_ZONE_COUNT: Final = 5


class Zone(TypedDict):
    zone: int
    name: str
    min_pct: float
    max_pct: float | None
    min_value: int
    max_value: int | None


class ZoneOverrideLike(TypedDict):
    metric: str
    zone: int
    min_pct: float
    max_pct: float


class ActivityLike(TypedDict, total=False):
    activity_id: str
    start_time: datetime
    duration_s: int | None
    avg_hr: int | None
    avg_power: int | None


@dataclass(frozen=True)
class ActivityDistribution:
    start_date: date
    by_zone: dict[str, float]
    source: MetricSource | None


def apply_overrides(
    hr_zone_rows: list[Zone],
    power_zone_rows: list[Zone] | None,
    overrides: Sequence[ZoneOverrideLike],
) -> tuple[list[Zone], list[Zone] | None]:
    hr_updated = _apply_metric_overrides(hr_zone_rows, overrides, "hr")
    power_updated = None
    if power_zone_rows is not None:
        power_updated = _apply_metric_overrides(power_zone_rows, overrides, "power")
    return hr_updated, power_updated


def empty_by_zone(count: int = 5) -> dict[str, float]:
    return {f"z{zone}": 0.0 for zone in range(1, count + 1)}


def activity_distribution(
    activity: ActivityLike,
    streams: Sequence[Mapping[str, object]],
    hr_zones: Sequence[Zone] | None,
) -> ActivityDistribution:
    """Time in HR zones, from per-sample data when present, else the session mean.

    Zones are passed in rather than derived here: the athlete's scheme decides
    the boundaries (see ``domain.insights.zone_schemes``), and showing the same
    activity against two schemes must not require recomputing anything else.
    """
    duration_s = _positive_int(activity.get("duration_s"))
    if duration_s == 0:
        return ActivityDistribution(_activity_date(activity), empty_by_zone(), None)
    if not hr_zones:
        return ActivityDistribution(_activity_date(activity), empty_by_zone(), None)
    hr_values = _metric_values(streams, "heart_rate")
    if hr_values:
        return _from_values(
            activity,
            hr_values,
            duration_s,
            lambda value: zone_for_value(value, hr_zones),
            "heart_rate",
        )
    avg_hr = _positive_float(activity.get("avg_hr"))
    if avg_hr:
        zone = zone_for_value(avg_hr, hr_zones)
        if zone is not None:
            return _from_summary(activity, duration_s, zone)
    return ActivityDistribution(_activity_date(activity), empty_by_zone(), None)


def combine_distributions(distributions: Iterable[ActivityDistribution]) -> dict[str, float]:
    totals = empty_by_zone()
    for distribution in distributions:
        for zone, minutes in distribution.by_zone.items():
            totals[zone] += minutes
    return _rounded(totals)


def weekly_breakdown(distributions: Iterable[ActivityDistribution]) -> list[dict[str, object]]:
    grouped: dict[date, dict[str, float]] = defaultdict(empty_by_zone)
    for distribution in distributions:
        week_start = distribution.start_date - timedelta(days=distribution.start_date.weekday())
        for zone, minutes in distribution.by_zone.items():
            grouped[week_start][zone] += minutes
    return [
        {
            "week_start": week,
            "by_zone": _rounded(by_zone),
            "distribution_type": classify_distribution(by_zone),
        }
        for week, by_zone in sorted(grouped.items())
    ]


def classify_distribution(by_zone: Mapping[str, float]) -> DistributionType:
    total = sum(by_zone.values())
    if total <= 0:
        return "high-volume"
    low = _percent(by_zone.get("z1", 0.0) + by_zone.get("z2", 0.0), total)
    mid = _percent(by_zone.get("z3", 0.0), total)
    high = _percent(by_zone.get("z4", 0.0) + by_zone.get("z5", 0.0), total)
    if low > POLARIZED_LOW_MIN and high > POLARIZED_HIGH_MIN:
        return "polarized"
    if low >= HIGH_VOLUME_LOW_MIN:
        return "high-volume"
    if mid >= THRESHOLD_MID_MIN or by_zone.get("z4", 0.0) >= by_zone.get("z2", 0.0):
        return "threshold"
    return "pyramidal"


def zone_for_value(
    value: float, zones: Sequence[Mapping[str, object]]
) -> int | None:
    """Index of the zone containing ``value``, or ``None`` when below the first zone.

    Zones are bucketed by their *lower* edge: ``value`` belongs to the last
    zone whose lower bound it reaches. Comparison deliberately ignores
    ``max_value``, because ``_zone`` derives that with ``floor`` for display
    (adjacent zones must not print overlapping ranges) while the lower edge
    uses ``ceil``. Testing ``value < max_value`` would therefore leave a
    one-beat hole between every pair of zones — at HRmax 188 the Z1/Z2 seam
    dropped heart rates of exactly 135, which silently discarded ~6% of real
    samples from both the zone histogram and hrTSS.

    ``None`` means the value is below the first zone's lower bound (for
    example a resting heart rate while the athlete is not exercising); it is
    never silently folded into Z1.
    """
    matched: int | None = None
    for zone in zones:
        zone_id = zone.get("zone")
        minimum = zone.get("min_value")
        if not isinstance(zone_id, int) or not isinstance(minimum, int | float):
            continue
        if value >= minimum:
            matched = zone_id
        else:
            break
    return matched


def _zone(row: tuple[int, float, float | None], reference: int) -> Zone:
    zone, min_pct, max_pct = row
    return {
        "zone": zone,
        "name": f"Z{zone}",
        "min_pct": min_pct,
        "max_pct": max_pct,
        "min_value": ceil(reference * min_pct / 100),
        "max_value": floor(reference * max_pct / 100) if max_pct is not None else None,
    }


def _apply_metric_overrides(
    zones: list[Zone], overrides: Sequence[ZoneOverrideLike], metric: str
) -> list[Zone]:
    by_zone = {row["zone"]: row for row in overrides if row["metric"] == metric}
    return [_override_zone(zone, by_zone.get(zone["zone"])) for zone in zones]


def _override_zone(zone: Zone, override: ZoneOverrideLike | None) -> Zone:
    updated = cast(Zone, cast(object, zone.copy()))
    if override is None:
        return updated
    min_pct = override["min_pct"]
    max_pct = override["max_pct"]
    reference = zone["min_value"] / (zone["min_pct"] / 100) if zone["min_pct"] else None
    if reference is None and zone["max_pct"]:
        reference = zone["max_value"] / (zone["max_pct"] / 100) if zone["max_value"] else None
    updated["min_pct"] = round(min_pct, 2)
    updated["max_pct"] = round(max_pct, 2)
    if reference:
        updated["min_value"] = ceil(reference * min_pct / 100)
        updated["max_value"] = floor(reference * max_pct / 100)
    return updated


def _from_values(
    activity: ActivityLike,
    values: Sequence[float],
    duration_s: int,
    zone_for_value: Callable[[float], int | None],
    source: MetricSource,
) -> ActivityDistribution:
    by_zone = empty_by_zone()
    seconds_per_sample = duration_s / len(values)
    for value in values:
        zone = zone_for_value(value)
        # Samples outside every zone (below Z1 or above the top zone's lower
        # bound) are not silently dropped into an adjacent zone — they are
        # genuinely unbucketed, and the totals will reflect that.
        if zone is not None:
            by_zone[f"z{zone}"] += seconds_per_sample / 60
    return ActivityDistribution(_activity_date(activity), _rounded(by_zone), source)


def _from_summary(activity: ActivityLike, duration_s: int, zone: int) -> ActivityDistribution:
    by_zone = empty_by_zone()
    by_zone[f"z{zone}"] = duration_s / 60
    return ActivityDistribution(_activity_date(activity), _rounded(by_zone), "summary")


def _metric_values(streams: Sequence[Mapping[str, object]], metric_type: str) -> list[float]:
    return [
        float(cast(int | float, row["value"]))
        for row in streams
        if row.get("metric_type") == metric_type and isinstance(row.get("value"), int | float)
    ]


def _activity_date(activity: ActivityLike) -> date:
    start_time = activity.get("start_time")
    if isinstance(start_time, datetime):
        return start_time.date()
    return date.today()


def _positive_int(value: object) -> int:
    return int(value) if isinstance(value, int | float) and value > 0 else 0


def _positive_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) and value > 0 else None


def _percent(value: float, total: float) -> float:
    return value / total * 100


def _rounded(by_zone: Mapping[str, float]) -> dict[str, float]:
    return {zone: round(minutes, 2) for zone, minutes in by_zone.items()}
