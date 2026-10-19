"""VDOT — Daniels' running ability score and training paces.

VDOT (V̇O₂max equivalent) is Jack Daniels' single-number running ability
metric: a race performance (distance, time) maps to one VDOT, and from VDOT we
derive training paces (E/M/T/I/R).

Both halves of the model are Daniels' own, and both operate in the **oxygen**
domain:

* oxygen cost of running at a velocity
  ``VO2 = −4.60 + 0.182258·v + 0.000104·v²``  (v in m/min)
* fraction of VO2max sustainable for a duration
  ``%max = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)``
  (t in minutes)

``VDOT = VO2(v) / %max(t)``. Training intensities are fractions of VDOT, so each
pace comes from solving the oxygen equation backwards. Working in velocity
instead — treating a %VO2max as a % of vVO2max — skips the quadratic's constant
term and lands every prescription too fast; for a 5K in 20:00 the easy range
came out at 4:45–5:57/km instead of 5:34–6:13/km.

Pure Python, no external dependencies. All paces are seconds-per-kilometre.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Final

# Daniels' oxygen cost of running, per m/min of velocity.
_COST_QUADRATIC: Final = 0.000104
_COST_LINEAR: Final = 0.182258
_COST_INTERCEPT: Final = -4.60

# Daniels' %VO2max–duration curve.
_FRACTION_INTERCEPT: Final = 0.8
_FRACTION_FAST_AMPLITUDE: Final = 0.1894393
_FRACTION_FAST_DECAY: Final = -0.012778
_FRACTION_SLOW_AMPLITUDE: Final = 0.2989558
_FRACTION_SLOW_DECAY: Final = -0.1932605

# Training intensities as a fraction of VDOT (i.e. of VO2max).
#
# These are oxygen fractions, not velocity fractions: 0.88 of VDOT corresponds
# to roughly 0.79 of vVO2max, because the oxygen curve's intercept is negative.
# Pinned against Daniels' published paces for VDOT 50 in
# `tests/domain/test_vdot.py`.
_E_PCT: Final = 0.55
_E_PCT_HIGH: Final = 0.63
_M_PCT: Final = 0.76
_M_PCT_HIGH: Final = 0.80
_T_PCT: Final = 0.83
_T_PCT_HIGH: Final = 0.88
_I_PCT: Final = 0.95
_I_PCT_HIGH: Final = 0.98
_R_PCT: Final = 1.05
_R_PCT_HIGH: Final = 1.10


def vdot_from_performance(distance_m: float, time_s: float) -> float | None:
    """Estimate VDOT from a single race/best-effort performance.

    Computes the oxygen cost of the observed velocity, divides by the fraction
    of VO2max sustainable for that duration, and rounds to one decimal.
    Returns None for efforts shorter than 3 minutes (too anaerobic for the
    aerobic model) or invalid inputs.
    """
    if distance_m <= 0 or time_s < 180:
        return None
    speed_m_per_min = distance_m / time_s * 60.0
    observed_vo2 = _vo2_from_velocity(speed_m_per_min)
    fraction = _fraction_vo2max_utilized(time_s)
    if fraction <= 0:
        return None
    return round(observed_vo2 / fraction, 1)


def vdot_from_efforts(
    efforts: Sequence[tuple[float, float]],
) -> float | None:
    """Best VDOT across a set of (distance_m, time_s) efforts.

    Takes the maximum — the performance that demanded the highest aerobic
    power. Distances below 1500 m are skipped.
    """
    best: float | None = None
    for distance_m, time_s in efforts:
        if distance_m < 1500:
            continue
        vdot = vdot_from_performance(distance_m, time_s)
        if vdot is not None and (best is None or vdot > best):
            best = vdot
    return best


def vdot_to_threshold_pace(vdot: float) -> float:
    """Threshold pace (s/km) implied by a VDOT.

    Threshold sits at 88% of VDOT in the oxygen domain. Used as a cross-check
    against the critical-speed model, which answers a different question.
    """
    pace = _pace_for_oxygen_fraction(vdot, _T_PCT_HIGH)
    return pace if pace is not None else 0.0


def vdot_to_vvo2max(vdot: float) -> float:
    """Velocity at VO2max (m/min) implied by a VDOT."""
    velocity = _velocity_from_vo2(vdot)
    return velocity if velocity is not None else 0.0


def vdot_from_threshold_pace(threshold_pace_s_per_km: float) -> float | None:
    """Invert :func:`vdot_to_threshold_pace`.

    The forward direction asks for the pace at which the athlete uses
    ``_T_PCT_HIGH`` of VDOT, solved through Daniels' oxygen cost curve. The
    inverse therefore has to run the same curve: threshold velocity → oxygen
    cost → VDOT. Dividing the velocity by the fraction instead skips the cost
    intercept and lands ~12% low, which quietly moved every prescribed pace.
    """
    if threshold_pace_s_per_km <= 0:
        return None
    velocity_m_per_min = 60000.0 / threshold_pace_s_per_km
    return _vo2_from_velocity(velocity_m_per_min) / _T_PCT_HIGH


def race_performance_paces(distance_m: float, target_time_s: int) -> dict[str, dict[str, float]]:
    """Daniels training pace ranges for an explicitly defined race target."""
    vdot = vdot_from_performance(distance_m, target_time_s)
    return training_paces(vdot) if vdot is not None else {}


def training_paces(vdot: float) -> dict[str, dict[str, float]]:
    """Daniels training paces (s/km) for E/M/T/I/R intensities.

    Each intensity returns ``{min, max}`` pace in s/km (min = fastest, the
    higher oxygen fraction; max = slowest, the lower one). Faster = smaller s/km.
    """
    if vdot <= 0:
        return {}
    return {
        "easy": _pace_range(vdot, _E_PCT, _E_PCT_HIGH),
        "marathon": _pace_range(vdot, _M_PCT, _M_PCT_HIGH),
        "threshold": _pace_range(vdot, _T_PCT, _T_PCT_HIGH),
        "interval": _pace_range(vdot, _I_PCT, _I_PCT_HIGH),
        "repetition": _pace_range(vdot, _R_PCT, _R_PCT_HIGH),
    }


def _pace_range(vdot: float, low_pct: float, high_pct: float) -> dict[str, float]:
    """{min, max} pace in s/km for an oxygen-fraction range of VDOT."""
    fast = _pace_for_oxygen_fraction(vdot, high_pct)
    slow = _pace_for_oxygen_fraction(vdot, low_pct)
    return {
        "min": round(fast) if fast is not None else 0,
        "max": round(slow) if slow is not None else 0,
    }


def _pace_for_oxygen_fraction(vdot: float, pct: float) -> float | None:
    """Pace (s/km) at ``pct`` of VDOT, solved in the oxygen domain."""
    velocity = _velocity_from_vo2(vdot * pct)
    if velocity is None or velocity <= 0:
        return None
    return 60000.0 / velocity


def _vo2_from_velocity(velocity_m_per_min: float) -> float:
    """Daniels' oxygen cost of running at ``velocity_m_per_min`` (ml/kg/min)."""
    return (
        _COST_INTERCEPT
        + _COST_LINEAR * velocity_m_per_min
        + _COST_QUADRATIC * velocity_m_per_min**2
    )


def _velocity_from_vo2(vo2: float) -> float | None:
    """Invert Daniels' cost equation: the velocity whose cost is ``vo2``.

    Solves ``a·v² + b·v + c = 0`` with ``a > 0`` and takes the positive root.
    Returns None when the request is below the model's intercept, i.e. no
    running velocity is that cheap.
    """
    a = _COST_QUADRATIC
    b = _COST_LINEAR
    c = _COST_INTERCEPT - vo2
    discriminant = b * b - 4.0 * a * c
    if discriminant < 0:
        return None
    root = (-b + math.sqrt(discriminant)) / (2.0 * a)
    return root if root > 0 else None


def _fraction_vo2max_utilized(time_s: float) -> float:
    """Fraction of VO2max sustainable for ``time_s`` (Daniels' curve).

    ``0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)``, t in
    minutes. Returns 1.0 at 3 minutes and tends to 0.8 for long efforts.
    """
    minutes = time_s / 60.0
    if minutes <= 3:
        return 1.0
    fraction = (
        _FRACTION_INTERCEPT
        + _FRACTION_FAST_AMPLITUDE * math.exp(_FRACTION_FAST_DECAY * minutes)
        + _FRACTION_SLOW_AMPLITUDE * math.exp(_FRACTION_SLOW_DECAY * minutes)
    )
    return max(0.0, min(1.0, fraction))
