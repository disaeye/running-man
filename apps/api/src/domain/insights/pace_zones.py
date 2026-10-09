"""Running pace zones, derived from threshold pace.

The platform already has HR zones (%HRmax) and power zones (%FTP). Runners
without power meters need pace zones to talk about intensity in their native
unit (min/km). These are derived from threshold pace using the Joe Friel /
TrainingPeaks pace-zone percentages of threshold, the standard for rTSS-based
training.

All paces are seconds-per-kilometre (s/km), matching the canonical unit in
``contracts/v1/metrics.yaml``. A "zone" is a [min, max) pace window; because
faster = smaller s/km, a zone's ``min_pace`` (fastest) is smaller than its
``max_pace`` (slowest).

Zone boundaries (fraction of threshold pace, where >1.0 means slower):
    Z1  ≥ 1.30×   (recovery — slower than 130% of threshold pace)
    Z2  1.20–1.30×  (endurance)
    Z3  1.10–1.20×  (tempo)
    Z4  1.00–1.10×  (threshold)
    Z5  < 1.00×     (VO2max — faster than threshold)
"""

from __future__ import annotations

from dataclasses import dataclass

# Zone → (slowest_factor, fastest_factor) of threshold pace.
# Slowest is the LARGER s/km (ratio > 1.0 = slower). Listed fast→slow below,
# but we build slow→fast for display. Factors multiply threshold pace.
_ZONE_BOUNDS: tuple[tuple[int, float, float], ...] = (
    (1, 1e9, 1.30),  # Z1 recovery: slower than 1.30× (no real upper cap)
    (2, 1.30, 1.20),
    (3, 1.20, 1.10),
    (4, 1.10, 1.00),
    (5, 1.00, 0.0),  # Z5: faster than threshold (down to 0)
)
ZONE_COUNT = 5


@dataclass(frozen=True, slots=True)
class PaceZone:
    zone: int
    min_pace_s_km: float  # fastest pace in this zone (smallest s/km)
    max_pace_s_km: float  # slowest pace in this zone (largest s/km)


def pace_zones(threshold_pace_s_km: float) -> list[PaceZone]:
    """Five pace zones as [min, max) windows around threshold pace.

    ``threshold_pace_s_km`` is the runner's current threshold pace (s/km), as
    estimated by the critical-speed model or entered manually. Returns zones
    ordered slow (Z1) → fast (Z5). ``min_pace`` ≤ pace < ``max_pace``.
    """
    if threshold_pace_s_km <= 0:
        return []
    return [
        PaceZone(
            zone=zone,
            min_pace_s_km=threshold_pace_s_km * fastest,
            max_pace_s_km=threshold_pace_s_km * slowest,
        )
        for zone, slowest, fastest in _ZONE_BOUNDS
    ]


def zone_for_pace(pace_s_km: float, threshold_pace_s_km: float) -> int | None:
    """The 1–5 zone a pace falls into, or None if inputs are invalid."""
    if threshold_pace_s_km <= 0 or pace_s_km <= 0:
        return None
    ratio = pace_s_km / threshold_pace_s_km
    for zone, slowest, fastest in _ZONE_BOUNDS:
        if fastest <= ratio < slowest:
            return zone
    # ratio >= 1e9 is impossible for real paces; anything beyond Z5 falls to Z5
    return 5 if ratio < 1.0 else 1
