"""Estimate HRmax from activity data using the Tangent Method (KDE).

Pure-Python implementation (no numpy/scipy dependency).

The Tangent Method:
1. Collect per-session max HR values
2. Build a kernel density estimate (Gaussian KDE)
3. Find the steepest downward slope after the mode
4. Extrapolate the tangent line to the x-axis → estimated HRmax

Reference: KU Leuven, validated on 150 athletes (r=0.81 vs lab HRmax).
"""

from __future__ import annotations

import math
from collections.abc import Sequence

MIN_SESSIONS_TANGENT = 30
MIN_SESSIONS_FALLBACK = 5
_KDE_BANDWIDTH_FACTOR = 2.5  # Silverman's rule-of-thumb approximation
_GRID_RESOLUTION = 300


def estimate_hrmax(session_max_hrs: Sequence[float]) -> dict[str, object]:
    """Estimate HRmax from a list of per-session max HR values.

    Returns a dict with:
      - hr_max: estimated value (float | None)
      - method: "tangent" | "rolling_max" | None
      - confidence: "high" | "medium" | "low" | None
      - data_sufficient: bool
      - near_max_count: int (sessions within 3 bpm of estimate)
      - session_count: int
    """
    cleaned = sorted(float(h) for h in session_max_hrs if h and h > 0)
    n = len(cleaned)

    if n < MIN_SESSIONS_FALLBACK:
        return _insufficient(n)

    if n >= MIN_SESSIONS_TANGENT:
        result = _tangent_method(cleaned)
        if result is not None:
            return _build_result(result, cleaned, "tangent")

    # Fallback: rolling max with confidence check
    rolling_max = cleaned[-1]
    return _build_result(rolling_max, cleaned, "rolling_max")


def _tangent_method(data: list[float]) -> float | None:
    """Apply the Tangent Method via Gaussian KDE."""
    if len(data) < 2:
        return None

    lo = data[0] - 10
    hi = data[-1] + 10
    bandwidth = _bandwidth(data)
    if bandwidth <= 0:
        return data[-1]

    grid = [lo + i * (hi - lo) / _GRID_RESOLUTION for i in range(_GRID_RESOLUTION + 1)]
    density = [_kde(x, data, bandwidth) for x in grid]

    mode_idx = max(range(len(density)), key=lambda i: density[i])
    if mode_idx >= len(grid) - 2:
        return data[-1]

    first_deriv = [
        (density[i + 1] - density[i - 1]) / (grid[i + 1] - grid[i - 1])
        if 0 < i < len(grid) - 1
        else 0.0
        for i in range(len(grid))
    ]

    post_peak = first_deriv[mode_idx:]
    steepest_offset = min(range(len(post_peak)), key=lambda i: post_peak[i])
    steepest_idx = mode_idx + steepest_offset

    if steepest_idx <= 0 or steepest_idx >= len(grid) - 1:
        return data[-1]

    slope = first_deriv[steepest_idx]
    if slope >= 0:
        return data[-1]

    x0 = grid[steepest_idx]
    y0 = density[steepest_idx]
    hr_max_est = x0 - y0 / slope

    if hr_max_est < data[-1] or hr_max_est > data[-1] + 25:
        return data[-1]

    return hr_max_est


def _bandwidth(data: list[float]) -> float:
    """Silverman's rule-of-thumb bandwidth."""
    n = len(data)
    mean = sum(data) / n
    variance = sum((x - mean) ** 2 for x in data) / n
    std = math.sqrt(variance)
    if std == 0:
        return 1.0
    iqr = _percentile(data, 75) - _percentile(data, 25)
    scale = min(std, iqr / 1.34) if iqr > 0 else std
    return 0.9 * scale * n ** (-1 / 5) * _KDE_BANDWIDTH_FACTOR


def _kde(x: float, data: list[float], bandwidth: float) -> float:
    """Gaussian kernel density estimate at point x."""
    n = len(data)
    coefficient = 1.0 / (n * bandwidth * math.sqrt(2 * math.pi))
    total = 0.0
    for point in data:
        u = (x - point) / bandwidth
        total += math.exp(-0.5 * u * u)
    return coefficient * total


def _percentile(sorted_data: list[float], pct: float) -> float:
    """Linear interpolation percentile (sorted_data must be sorted)."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * pct / 100
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    d0 = sorted_data[f] * (c - k)
    d1 = sorted_data[c] * (k - f)
    return d0 + d1


def _build_result(hr_max: float, data: list[float], method: str) -> dict[str, object]:
    near_max = sum(1 for h in data if h >= hr_max - 3)
    confidence = "high" if near_max >= 3 else "medium" if near_max >= 1 else "low"
    return {
        "hr_max": round(hr_max),
        "method": method,
        "confidence": confidence,
        "data_sufficient": True,
        "near_max_count": near_max,
        "session_count": len(data),
    }


def _insufficient(n: int) -> dict[str, object]:
    return {
        "hr_max": None,
        "method": None,
        "confidence": None,
        "data_sufficient": False,
        "near_max_count": 0,
        "session_count": n,
    }
