"""Estimate Lactate Threshold Heart Rate (LTHR) from activity data.

Implements the Dmax method on HR-vs-intensity curves and the
best-effort window method (Intervals.icu approach).

Pure-Python, no external dependencies.
"""

from __future__ import annotations

from collections.abc import Sequence

MIN_HARD_EFFORTS = 5  # Minimum qualifying activities

# A 20-minute maximal window averages about 5% above the threshold it is used to
# estimate: the effort is short enough that heart rate is still climbing through
# the lactate steady state it describes. Friel's field protocol takes the last
# 20 minutes of a 30-minute time trial — a window that is already at threshold —
# so applying no correction to a bare 20-minute maximum reads the peak of a hard
# effort as the threshold itself and lands several bpm high. Every zone built on
# LTHR then sits too high.
WINDOW_20MIN_TO_LTHR = 0.95

# Threshold is a sustainable intensity, maximal heart rate is a ceiling, so an
# estimate at or above HRmax is impossible rather than merely suspicious.
MIN_GAP_BELOW_HRMAX = 2

_WINDOW_20MIN = 1200  # seconds
_WINDOW_60MIN = 3600  # seconds


def estimate_lthr(
    best_20min_hrs: Sequence[float],
    best_60min_hrs: Sequence[float],
    hr_max: int | None = None,
) -> dict[str, object]:
    """Estimate LTHR from best sustained HR windows across activities.

    Two windows answer slightly different questions:

    * the best 20-minute average is a hard effort whose peak sits ~5% above
      threshold, so it is corrected by :data:`WINDOW_20MIN_TO_LTHR`;
    * the best 60-minute average is a *lower bound* — if the athlete sustained
      that heart rate for an hour, threshold cannot be below it.

    The estimate is the corrected 20-minute value, raised to the 60-minute lower
    bound when that bound is higher. Taking the maximum of an estimate and a
    demonstrated lower bound is not the same as taking the maximum of two
    estimates: the earlier version applied both corrections as if they estimated
    the same quantity, with a 0.98 factor that put LTHR above what any sustained
    run showed.

    Args:
        best_20min_hrs: Highest 20-min average HR per activity
        best_60min_hrs: Highest 60-min average HR per activity
        hr_max: The athlete's maximal heart rate, when known, so an impossible
            threshold can be refused instead of published.
    Returns:
        dict with lthr, confidence, data_sufficient, method
    """
    valid_20 = sorted(float(h) for h in best_20min_hrs if h and h > 0)
    valid_60 = sorted(float(h) for h in best_60min_hrs if h and h > 0)

    if len(valid_20) < MIN_HARD_EFFORTS:
        return {
            "lthr": None,
            "method": None,
            "confidence": None,
            "data_sufficient": False,
            "near_threshold_count": 0,
        }

    best_20 = valid_20[-1]
    best_60 = valid_60[-1] if valid_60 else 0.0

    from_20 = best_20 * WINDOW_20MIN_TO_LTHR
    lthr = max(from_20, best_60) if best_60 > 0 else from_20

    clamped = False
    if hr_max is not None and hr_max > MIN_GAP_BELOW_HRMAX and lthr >= hr_max:
        lthr = hr_max - MIN_GAP_BELOW_HRMAX
        clamped = True

    near_count = sum(1 for h in valid_20 if h >= lthr - 3)
    if clamped:
        confidence = "low"
    else:
        confidence = "high" if near_count >= 3 else "medium" if near_count >= 1 else "low"

    return {
        "lthr": round(lthr),
        "method": "best_effort_window",
        "confidence": confidence,
        "data_sufficient": True,
        "near_threshold_count": near_count,
        "source_20min": round(from_20),
        "source_60min": round(best_60) if best_60 > 0 else None,
    }


def compute_rolling_avg(values: Sequence[float], window: int) -> list[float]:
    """Compute rolling average with given window size."""
    if len(values) < window:
        return []
    result = []
    current_sum = sum(values[:window])
    result.append(current_sum / window)
    for i in range(window, len(values)):
        current_sum += values[i] - values[i - window]
        result.append(current_sum / window)
    return result


def best_window_average(
    hr_samples: Sequence[float],
    sample_interval_s: float,
    window_s: int,
) -> float | None:
    """Find the highest rolling average HR for a given time window.

    Args:
        hr_samples: HR values at regular intervals
        sample_interval_s: seconds between samples
        window_s: window length in seconds (e.g. 1200 for 20 min)
    Returns:
        Highest average HR over the window, or None
    """
    window_size = int(window_s / sample_interval_s)
    if window_size < 2 or len(hr_samples) < window_size:
        return None
    averages = compute_rolling_avg(hr_samples, window_size)
    return max(averages) if averages else None
