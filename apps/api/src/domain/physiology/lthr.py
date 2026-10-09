"""Estimate Lactate Threshold Heart Rate (LTHR) from activity data.

Implements the Dmax method on HR-vs-intensity curves and the
best-effort window method (Intervals.icu approach).

Pure-Python, no external dependencies.
"""

from __future__ import annotations

from collections.abc import Sequence

MIN_HARD_EFFORTS = 5  # Minimum qualifying activities
_WINDOW_20MIN = 1200  # seconds
_WINDOW_60MIN = 3600  # seconds


def estimate_lthr(
    best_20min_hrs: Sequence[float],
    best_60min_hrs: Sequence[float],
) -> dict[str, object]:
    """Estimate LTHR from best sustained HR windows across activities.

    Uses the Intervals.icu approach:
      LTHR = max(best_20min_hr * 0.98, best_60min_hr)

    Args:
        best_20min_hrs: Highest 20-min average HR per activity
        best_60min_hrs: Highest 60-min average HR per activity
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

    from_20 = best_20 * 0.98
    from_60 = best_60

    lthr = max(from_20, from_60) if from_60 > 0 else from_20

    near_count = sum(1 for h in valid_20 if h >= lthr - 3)
    confidence = "high" if near_count >= 3 else "medium" if near_count >= 1 else "low"

    return {
        "lthr": round(lthr),
        "method": "best_effort_window",
        "confidence": confidence,
        "data_sufficient": True,
        "near_threshold_count": near_count,
        "source_20min": round(from_20),
        "source_60min": round(from_60) if from_60 > 0 else None,
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
