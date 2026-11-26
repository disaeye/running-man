"""Critical Speed — the aerobic asymptote of the distance–time boundary.

Fits ``distance = CS·t + W'`` to maximal efforts and returns CS and its pace.

CS is the **asymptote** of the two-parameter model: by construction it is slower
than any sustained performance the athlete has actually produced, and slower
than lactate-threshold pace. For an athlete with 5K 20:00, 10K 41:20 and a 1:31
half, CS comes out near 4:28/km — slower than the half they just ran. It is a
useful anchor for race-time prediction over long distances and a useful
cross-check on threshold pace, and it is not threshold pace.

Threshold pace (LT2) comes from Daniels' VDOT model in ``vdot.py``, driven by
the best maximal effort.

Pure-Python implementation.

Reference: Critical Power concept (Monod & Scherrer 1965),
adapted for running by Hughson et al. (1984).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

MIN_EFFORTS = 4  # Minimum distinct efforts for curve fitting

# Bounds below which the critical-speed model's assumptions do not hold: a
# sprint and a jog are not on the same boundary curve.
MIN_EFFORT_DISTANCE_M = 1000.0
MIN_EFFORT_DURATION_S = 180.0

# A maximal effort is at most this much slower than the athlete's fastest pace.
# 1.15 keeps genuinely hard runs (races, time trials, threshold sessions) while
# excluding easy and recovery running, which are 30-60% slower.
EFFORT_PACE_TOLERANCE = 1.15

# Fraction of HRmax when LTHR is unavailable; HRmax is a ceiling so 95% keeps
# near-maximal sessions. When LTHR is known, whole-run avg HR of a 5K–10K race
# includes initial cardiac lag, so 91% of LTHR admits real threshold efforts
# while still excluding steady aerobic (≈85%) and easy (≈79%) volume.
EFFORT_MIN_HR_RATIO = 0.95
_LTHR_MIN_HR_RATIO = 0.91


@dataclass(frozen=True)
class EffortPoint:
    """A best-effort data point: distance and time."""

    distance_m: float
    duration_s: float

    @property
    def speed_ms(self) -> float:
        return self.distance_m / self.duration_s if self.duration_s > 0 else 0.0

    @property
    def pace_s_per_km(self) -> float:
        return (self.duration_s / self.distance_m * 1000) if self.distance_m > 0 else 0.0


def estimate_critical_speed(efforts: Sequence[EffortPoint]) -> dict[str, object]:
    """Fit Critical Speed from best-effort distance-time points.

    Uses the linear form of the critical power model:
        distance = CS * time + W'
    where CS = Critical Speed, W' = anaerobic capacity.

    Solving via least-squares linear regression on 1/duration vs 1/distance
    (the 'inverse' model, which is more robust for short efforts).

    Returns:
        dict with critical_speed_ms, critical_speed_s_per_km, confidence,
        data_sufficient, method
    """
    valid = [e for e in efforts if e.distance_m > 100 and e.duration_s > 30]
    if len(valid) < MIN_EFFORTS:
        return _insufficient(len(valid))

    valid.sort(key=lambda e: e.duration_s)

    # Method: Linear regression on distance vs time
    # distance = CS * time + W'
    # We solve for CS (slope) and W' (intercept)
    cs = _linear_regression_distance_time(valid)

    if cs <= 0 or cs > 10:  # Sanity: 10 m/s = 2:46/km, faster than elite 5K
        return _insufficient(len(valid))

    critical_speed_s_per_km = 1000 / cs

    # Confidence: check spread of effort durations
    durations = [e.duration_s for e in valid]
    duration_range = max(durations) - min(durations)
    if duration_range < 600:  # Less than 10 min spread
        confidence = "low"
    elif len(valid) >= 6 and duration_range > 1800:
        confidence = "high"
    else:
        confidence = "medium"

    return {
        "critical_speed_s_per_km": round(critical_speed_s_per_km),
        "critical_speed_ms": round(cs, 3),
        "confidence": confidence,
        "data_sufficient": True,
        "method": "critical_speed_model",
        "effort_count": len(valid),
    }


def extract_efforts_from_activities(
    activities: Sequence[dict[str, object]],
    sport_filter: str = "Run",
    *,
    hr_max: int | None = None,
    lthr: int | None = None,
) -> list[EffortPoint]:
    """Best-effort points from activity summaries, filtered to hard efforts.

    The critical-speed model assumes each point is a *maximal* effort over its
    duration: it fits ``distance = CS·time + W'`` through the boundary of what
    the athlete can sustain. Feeding it every run regardless of intensity is the
    defect this filter exists to correct.

    Measured on this deployment before the filter: an 8:10/km recovery run
    (67 min, HR 144) and a 4:34/km race (22 min, HR 174) were both accepted as
    boundary points, and the fit returned 6'18"/km with ``confidence: high``
    while the athlete's actual best 10 km was 5'14"/km. Because rTSS scales with
    (threshold/pace)², a threshold 23% too slow understates every session's load.

    A run qualifies when it is fast relative to the athlete's own best pace *and*
    was actually hard — see the module constants for the thresholds. Without HR
    references only the pace filter applies, which is weaker but still removes
    recovery running.
    """
    candidates = [
        candidate
        for candidate in (_candidate(activity, sport_filter) for activity in activities)
        if candidate is not None
    ]
    if not candidates:
        return []
    return _select_efforts(candidates, _effort_reference_hr(lthr, hr_max))


@dataclass(frozen=True, slots=True)
class _Candidate:
    speed_ms: float
    point: EffortPoint
    avg_hr: float | None


def _candidate(activity: dict[str, object], sport_filter: str) -> _Candidate | None:
    """A plausible effort point, or None when the activity cannot be one."""
    if not _matches_sport(activity, sport_filter):
        return None
    distance = _positive_float(activity.get("distance_m"))
    duration = _positive_float(activity.get("duration_s"))
    if distance is None or duration is None:
        return None
    if distance <= MIN_EFFORT_DISTANCE_M or duration <= MIN_EFFORT_DURATION_S:
        return None
    return _Candidate(
        speed_ms=distance / duration,
        point=EffortPoint(distance_m=distance, duration_s=duration),
        avg_hr=_positive_float(activity.get("avg_hr")),
    )


def _matches_sport(activity: dict[str, object], sport_filter: str) -> bool:
    sport = str(activity.get("sport", ""))
    if not sport_filter:
        return True
    return sport_filter.lower() in sport.lower() or sport.lower() in sport_filter.lower()


def _positive_float(value: object) -> float | None:
    if not isinstance(value, int | float):
        return None
    number = float(value)
    return number if number > 0 else None


def _select_efforts(
    candidates: list[_Candidate], hr_threshold: float | None
) -> list[EffortPoint]:
    """Keep the points that describe the athlete's sustainable boundary.

    Filter by heart rate *first* so a short run whose average HR fell short of
    threshold cannot set an artificially fast ``fastest_pace`` and knock out
    genuine 10K / half-marathon efforts. The cutoff is on *pace* (s/km), where
    smaller is faster.
    """
    hard = [
        candidate
        for candidate in candidates
        if _is_hard_enough(candidate.avg_hr, hr_threshold)
    ]
    if not hard:
        return []
    fastest_pace = min(1000.0 / candidate.speed_ms for candidate in hard)
    pace_cutoff = fastest_pace * EFFORT_PACE_TOLERANCE
    return [
        candidate.point
        for candidate in hard
        if 1000.0 / candidate.speed_ms <= pace_cutoff
    ]


def _is_hard_enough(avg_hr: float | None, hr_threshold: float | None) -> bool:
    """Whether an activity's heart rate indicates a threshold-level effort.

    An activity without HR passes on its pace alone: the pace filter already
    required it to be near the athlete's best, and rejecting it would discard
    real efforts recorded without a strap.
    """
    if hr_threshold is None or avg_hr is None:
        return True
    return avg_hr >= hr_threshold


def _effort_reference_hr(lthr: int | None, hr_max: int | None) -> float | None:
    """Minimum average HR (bpm) for a threshold effort, preferring LTHR.

    LTHR is the threshold itself; whole-run avg HR of sustained races sits just
    below it due to warmup/ramp lag, so ``_LTHR_MIN_HR_RATIO`` applies. HRmax
    is a ceiling and keeps ``EFFORT_MIN_HR_RATIO``.
    """
    if lthr is not None and lthr > 0:
        return float(lthr) * _LTHR_MIN_HR_RATIO
    if hr_max is not None and hr_max > 0:
        return float(hr_max) * EFFORT_MIN_HR_RATIO
    return None


def _linear_regression_distance_time(points: list[EffortPoint]) -> float:
    """Fit distance = CS * time + W' via least squares.

    Returns Critical Speed (slope) in m/s.
    """
    n = len(points)
    if n < 2:
        return 0.0

    # x = time, y = distance
    sum_x = sum(p.duration_s for p in points)
    sum_y = sum(p.distance_m for p in points)
    sum_xy = sum(p.duration_s * p.distance_m for p in points)
    sum_x2 = sum(p.duration_s**2 for p in points)

    denominator = n * sum_x2 - sum_x**2
    if denominator == 0:
        return 0.0

    cs = (n * sum_xy - sum_x * sum_y) / denominator
    return cs


def _insufficient(n: int) -> dict[str, object]:
    return {
        "critical_speed_s_per_km": None,
        "critical_speed_ms": None,
        "confidence": None,
        "data_sufficient": False,
        "method": None,
        "effort_count": n,
    }
