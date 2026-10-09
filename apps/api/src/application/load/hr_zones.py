from collections.abc import Mapping, Sequence


def compute_hr_zone_times(
    avg_hr: float | int | None,
    duration_s: int,
    hr_zones: Sequence[Mapping[str, object]],
) -> dict[int, float]:
    if avg_hr is None or duration_s <= 0:
        return {}

    for zone in hr_zones:
        zone_id = _zone_id(zone)
        min_value = _float_or_none(zone.get("min_value"))
        max_value = _float_or_none(zone.get("max_value"))
        if zone_id is not None and _in_zone(float(avg_hr), min_value, max_value):
            return {zone_id: float(duration_s)}
    return {}


def compute_hr_zone_times_from_samples(
    hr_samples: Sequence[float],
    duration_s: int,
    hr_zones: Sequence[Mapping[str, object]],
) -> dict[int, float]:
    """Per-sample HR zone residence time.

    Unlike the avg-only variant, this buckets each sample into its zone, so an
    interval session (alternating Z2/Z5) reports real time-in-zone rather than
    collapsing the whole activity into one zone via the mean. Requires the HR
    stream; falls back to uniform zero when samples are absent.
    """
    if not hr_samples or duration_s <= 0 or not hr_zones:
        return {}
    seconds_per_sample = duration_s / len(hr_samples)
    totals: dict[int, float] = {}
    for value in hr_samples:
        for zone in hr_zones:
            zone_id = _zone_id(zone)
            if zone_id is None:
                continue
            min_value = _float_or_none(zone.get("min_value"))
            max_value = _float_or_none(zone.get("max_value"))
            if _in_zone(float(value), min_value, max_value):
                totals[zone_id] = totals.get(zone_id, 0.0) + seconds_per_sample
                break
    return totals


def _zone_id(zone: Mapping[str, object]) -> int | None:
    value = zone.get("zone")
    return value if isinstance(value, int) else None


def _float_or_none(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


def _in_zone(value: float, min_value: float | None, max_value: float | None) -> bool:
    if min_value is not None and value < min_value:
        return False
    if max_value is not None and value > max_value:
        return False
    return True
