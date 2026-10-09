"""VDOT — Daniels' running ability score and training paces.

VDOT (V̇O₂max equivalent) is Jack Daniels' single-number running ability
metric: a race performance (distance, time) maps to one VDOT, and from VDOT we
derive evidence-based training paces (E/M/T/I/R). This is the runner's
"threshold + economy" anchor — the ability vector that drives pace zones and
session prescription.

The model: Daniels defines %VO2max utilized as a function of effort duration,
then solves for the VO2max that would produce the observed performance. We use
the standard Daniels polynomial for fraction-utilized and solve numerically
(there is no closed form because duration appears on both sides).

Pure Python, no external dependencies. All paces are seconds-per-kilometre.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Final

# Daniels training-pace fractions of VDOT velocity (vVO2max).
# Source: Daniels' Running Formula (3rd ed.). Each intensity is a target % of
# the velocity at VO2max, tuned so the pace is sustainable for its purpose.
_E_PCT: Final = 0.59   # Easy / recovery (59–74%)
_E_PCT_HIGH: Final = 0.74
_M_PCT: Final = 0.75   # Marathon (~75–84%)
_M_PCT_HIGH: Final = 0.84
_T_PCT: Final = 0.83   # Threshold (~83–88%)
_T_PCT_HIGH: Final = 0.88
_I_PCT: Final = 0.95   # Interval (~95–100%)
_I_PCT_HIGH: Final = 1.00
_R_PCT: Final = 1.10   # Repetition (>100%, short neuromuscular)

# Speed at VO2max in the Daniels model, derived from VDOT (ml/kg/min) via the
# running economy constant ~ 3.6 ml/kg/m — we use the standard linear relation
# v(m/min) = VDOT / 3.6  ... but Daniels gives velocity directly from VO2.
# We avoid the economy constant by solving VDOT then converting to pace via the
# ACSM gross-oxygen-cost-of-running: VO2 (ml/kg/min) = speed(m/min) * 0.2 + 3.5.
_RUNNING_O2_COST: Final = 0.2   # ml/kg/min per m/min of speed
_RUNNING_REST_O2: Final = 3.5   # ml/kg/min resting cost


def vdot_from_performance(distance_m: float, time_s: float) -> float | None:
    """Estimate VDOT from a single race/best-effort performance.

    Uses Daniels' method: compute the oxygen cost of the observed speed, scale
    by the fraction of VO2max sustainable for that duration, solve for VO2max.
    Returns None for sub-3-minute efforts (too short for aerobic model) or
    invalid inputs.
    """
    if distance_m <= 0 or time_s < 180:
        return None
    speed_m_per_min = distance_m / time_s * 60.0
    observed_vo2 = speed_m_per_min * _RUNNING_O2_COST + _RUNNING_REST_O2
    fraction = _fraction_vo2max_utilized(time_s)
    if fraction <= 0:
        return None
    return round(observed_vo2 / fraction, 1)


def vdot_from_efforts(
    efforts: Sequence[tuple[float, float]],
) -> float | None:
    """Best VDOT across a set of (distance_m, time_s) efforts.

    Takes the maximum — the performance that demanded the highest aerobic
    power. Distances < 1500 m or times < 3 min are skipped (too anaerobic).
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

    Threshold velocity ≈ 88% of vVO2max. We go VDOT → vVO2max (via running
    economy) → 88% → pace. This cross-checks the CS-model threshold pace.
    """
    v_vo2max_m_per_min = (vdot - _RUNNING_REST_O2) / _RUNNING_O2_COST
    threshold_m_per_min = v_vo2max_m_per_min * _T_PCT_HIGH
    if threshold_m_per_min <= 0:
        return 0.0
    return 60.0 / threshold_m_per_min * 1000.0


def race_performance_paces(distance_m: float, target_time_s: int) -> dict[str, dict[str, float]]:
    """Daniels training pace ranges for an explicitly defined race target."""
    vdot = vdot_from_performance(distance_m, target_time_s)
    return training_paces(vdot) if vdot is not None else {}


def training_paces(vdot: float) -> dict[str, dict[str, float]]:
    """Daniels training paces (s/km) for E/M/T/I/R intensities.

    Each intensity returns ``{min, max}`` pace in s/km (min = fastest, the
    higher % bound; max = slowest, the lower % bound). Faster = smaller s/km.
    """
    v_vo2max = (vdot - _RUNNING_REST_O2) / _RUNNING_O2_COST
    if v_vo2max <= 0:
        return {}
    return {
        "easy": _pace_range(v_vo2max, _E_PCT, _E_PCT_HIGH),
        "marathon": _pace_range(v_vo2max, _M_PCT, _M_PCT_HIGH),
        "threshold": _pace_range(v_vo2max, _T_PCT, _T_PCT_HIGH),
        "interval": _pace_range(v_vo2max, _I_PCT, _I_PCT_HIGH),
        "repetition": _pace_range(v_vo2max, _R_PCT, _R_PCT),
    }


def _pace_range(v_vo2max_m_per_min: float, low_pct: float, high_pct: float) -> dict[str, float]:
    """{min, max} pace in s/km for a velocity range.

    low_pct (slower) → max s/km; high_pct (faster) → min s/km.
    """
    fast_m_per_min = v_vo2max_m_per_min * high_pct
    slow_m_per_min = v_vo2max_m_per_min * low_pct
    min_pace = 60.0 / fast_m_per_min * 1000.0 if fast_m_per_min > 0 else 0.0
    max_pace = 60.0 / slow_m_per_min * 1000.0 if slow_m_per_min > 0 else 0.0
    return {"min": round(min_pace), "max": round(max_pace)}


def _fraction_vo2max_utilized(time_s: float) -> float:
    """Fraction of VO2max sustainable for ``time_s`` (Daniels' curve).

    Daniels' %VO2max vs duration (tabulated): ~100% at 3 min, 93% at 10 min,
    86% at 30 min, 82% at 60 min, 78% at 120 min, 75% at 180 min. Modeled as
    a slow logarithmic decay, clamped to Daniels' asymptote.
    """
    minutes = time_s / 60.0
    if minutes <= 3:
        return 1.0
    # f(t) = 1 - k*ln(t/3); solve k from f(60)=0.82 → k = 0.18/ln(20) ≈ 0.0602.
    k = 0.0602
    frac = 1.0 - k * math.log(minutes / 3.0)
    return max(0.60, min(1.0, frac))
