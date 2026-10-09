"""Grade-Adjusted Pace (GAP) and Normalized Graded Pace (NGP).

Running load must be measured on the *external work* of covering ground, not the
raw pace the watch reports. A 5:00/km uphill and a 5:00/km downhill are not the
same metabolic cost. Grade-adjusted pace translates an observed pace at a given
grade into the flat-ground pace of equivalent cost, so that hilly runs no longer
look anomalously hard (decoupling) or cheap (load).

The grade→cost model is the Minetti aerobic-cost curve (Minetti et al. 2002),
fitted as a polynomial of grade. It is the de-facto standard behind Strava GAP
and TrainingPeaks NGP. Pure Python — no external dependencies.

Inputs are per-sample (or per-segment) distances and altitudes. Outputs are in
seconds-per-kilometre (the canonical running pace unit), matching
``threshold_pace`` in ``contracts/v1/metrics.yaml``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final

# Minetti et al. (2002) net energy cost of running vs grade, fit as a
# polynomial of grade (fraction). Coefficients for grade in [-0.45, 0.45].
# Cost is expressed relative to flat (grade=0 → multiplier 1.0).
# Source: Minetti "Energy cost of locomotion in humans at different speeds"
# Strava's GAP uses a similar cost-surface derived from this curve.
_MINETTI_COEFFS: Final[tuple[float, ...]] = (
    155.4,
    -30.4,
    -8.31,   # grade^2 (flat baseline baked into normalization below)
)


# Lowest multiplier treated as physically plausible on a descent.
#
# Minetti's polynomial is a good fit over the range it was measured on but
# diverges badly on steep downhill: at −22% it returns 0.014, i.e. running
# downhill costs 1.4% of running on the flat. Measured against the published
# values (Cr normalized to flat = 1.0: −10% ≈ 0.61, −20% ≈ 0.36) the fit is
# accurate to about −10% and then collapses, crossing zero near −25%.
#
# The consequence was not cosmetic. A 42-minute run's NGP came out at 2,896 s/km
# (48 min/km) because a handful of samples on a −22% segment divided by 0.013,
# and the resulting value exceeded the metric's legal range (1,200-1,800 s/km),
# so the database rejected the insert and the whole recompute failed with a
# CHECK violation.
#
# Downhill running does get cheaper, but not without limit: 0.5 is the floor
# used here, slightly above the ~0.36 reported at −20%, and it is only reached
# past the point where the polynomial stops being trustworthy.
MIN_DESCENT_MULTIPLIER: Final = 0.5

# Steepest grade the polynomial is trusted over. Past this the value is pinned.
_TRUSTED_DOWNHILL_GRADE: Final = -0.15


def grade_cost_multiplier(grade: float) -> float:
    """Metabolic-cost multiplier for running at ``grade`` (fraction).

    ``grade`` is rise/run, so 0.0 is flat and returns 1.0. Climbing costs more;
    descending costs less, down to :data:`MIN_DESCENT_MULTIPLIER`.

    Based on Minetti et al. (2002), ``Cr = 155.4g⁵ − 30.4g⁴ − 8.31g³ + 4.14g + 1``
    normalized so flat = 1.0. The polynomial is evaluated only where it is
    trustworthy (see :data:`_TRUSTED_DOWNHILL_GRADE`); steeper descents are
    pinned to the floor rather than allowed to approach zero, which would make
    downhill running appear nearly free.
    """
    g = max(-0.45, min(0.45, grade))
    if g < _TRUSTED_DOWNHILL_GRADE:
        return MIN_DESCENT_MULTIPLIER
    raw = (
        _MINETTI_COEFFS[0] * g**5
        + _MINETTI_COEFFS[1] * g**4
        + _MINETTI_COEFFS[2] * g**3
        + 4.14 * g
        + 1.0
    )
    return max(raw, MIN_DESCENT_MULTIPLIER)


def sample_grade(
    distances: Sequence[float], altitudes: Sequence[float], index: int
) -> float | None:
    """Grade (rise/run) at ``index``, using adjacent samples.

    Returns None at the boundaries or when the horizontal distance is zero.
    """
    if index <= 0 or index >= len(distances) or index >= len(altitudes):
        return None
    horizontal = distances[index] - distances[index - 1]
    if horizontal <= 0:
        return None
    vertical = altitudes[index] - altitudes[index - 1]
    return vertical / horizontal


def grade_adjusted_pace_series(
    *,
    distances: Sequence[float],
    altitudes: Sequence[float],
    times: Sequence[float],
) -> list[float]:
    """Per-sample GAP in s/km.

    ``distances`` (m, cumulative), ``altitudes`` (m), ``times`` (s, cumulative)
    must be parallel and equally-indexed. For each interior sample the raw pace
    is divided by the grade cost multiplier, yielding the flat-equivalent pace.
    Boundary samples (where grade is undefined) inherit the nearest interior
    value, or fall back to the raw pace if none exists.
    """
    n = min(len(distances), len(altitudes), len(times))
    if n < 2:
        return []
    gaps: list[float] = [0.0] * n
    for i in range(n):
        grade = sample_grade(distances, altitudes, i)
        raw_pace = _raw_pace(times, distances, i)
        if grade is not None and raw_pace is not None:
            gaps[i] = raw_pace / grade_cost_multiplier(grade)
        elif raw_pace is not None:
            gaps[i] = raw_pace
        else:
            # No distance covered in this interval — a pause, a red light, or a
            # dropped GPS sample. Carrying the previous value forward was wrong
            # twice over: it propagated whatever the last delta happened to be
            # (a 0.1 m step yields 10,000 s/km), and because the 4th-power mean
            # in NGP weights large values heavily, a run that stopped for a few
            # seconds produced an NGP several times its real pace. Measured on
            # this deployment: 0.5% of samples produced values above 9,000 s/km
            # and pushed a 44-minute run's NGP past the metric's legal range
            # (1,800 s/km), which the database rejected outright.
            #
            # A stopped interval contributes no distance, so it has no pace to
            # contribute; zero is excluded from the rolling mean below rather
            # than being read as an infinitely slow one.
            gaps[i] = 0.0
    return gaps


def average_gap(
    *,
    distances: Sequence[float],
    altitudes: Sequence[float],
    times: Sequence[float],
) -> float | None:
    """Time-weighted average GAP over the activity, in s/km.

    Returns None when there is insufficient distance or elevation data.
    """
    gaps = grade_adjusted_pace_series(
        distances=distances, altitudes=altitudes, times=times
    )
    n = min(len(distances), len(times))
    if n < 2 or not gaps:
        return None
    total_distance = distances[n - 1] - distances[0]
    if total_distance <= 0:
        return None
    # Average pace weighted by the distance covered in each sample interval.
    weighted_pace_sum = 0.0
    distance_covered = 0.0
    for i in range(1, n):
        seg_distance = distances[i] - distances[i - 1]
        if seg_distance <= 0:
            continue
        weighted_pace_sum += gaps[i] * seg_distance
        distance_covered += seg_distance
    if distance_covered <= 0:
        return None
    return weighted_pace_sum / distance_covered


def normalized_graded_pace(
    *,
    distances: Sequence[float],
    altitudes: Sequence[float],
    times: Sequence[float],
    window: int = 30,
) -> float | None:
    """NGP (s/km) — the 4th-power smoothed GAP, analogous to Normalized Power.

    Running's equivalent of NP: smooth the GAP stream with a 30-sample rolling
    mean, raise to the 4th power, average, take the 4th root. This captures the
    strain of variable-pace running (intervals, surges) the way a flat average
    cannot. Requires ≥ ``window`` samples.
    """
    gaps = grade_adjusted_pace_series(
        distances=distances, altitudes=altitudes, times=times
    )
    if len(gaps) < window:
        return None
    # Rolling mean over moving samples only: a zero marks an interval with no
    # distance, and including it as a pace would report the athlete as slower
    # than they ran.
    rolling = _rolling_mean([g for g in gaps if g > 0], window)
    if not rolling:
        return None
    fourth_power_sum = sum(v**4 for v in rolling)
    return (fourth_power_sum / len(rolling)) ** 0.25


def _raw_pace(
    times: Sequence[float], distances: Sequence[float], index: int
) -> float | None:
    """Instantaneous pace in s/km at ``index`` from time/distance deltas."""
    if index <= 0 or index >= len(times) or index >= len(distances):
        return None
    dt = times[index] - times[index - 1]
    dd = distances[index] - distances[index - 1]
    if dt <= 0 or dd <= 0:
        return None
    return dt / dd * 1000.0


def _rolling_mean(values: Sequence[float], window: int) -> list[float]:
    if len(values) < window:
        return []
    out: list[float] = []
    window_sum = sum(values[:window])
    out.append(window_sum / window)
    for i in range(window, len(values)):
        window_sum += values[i] - values[i - window]
        out.append(window_sum / window)
    return out
