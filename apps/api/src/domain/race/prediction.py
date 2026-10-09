"""Race time prediction for running — Riegel formula with critical-speed cross-check.

Riegel (1981) projects a finish time from a known best-effort::

    T2 = T1 * (D2 / D1) ** 1.06

A single recent effort anchors extrapolations to the standard race distances
(5K / 10K / half / marathon).

Cross-check: the critical-speed model (see :mod:`domain.physiology.threshold_pace`)
fits ``distance = CS * time + W'`` from a set of best-effort points, giving an
independent prediction ``time = (D - W') / CS``. Agreement between the two
methods calibrates overall confidence.

Pure-Python, no numpy/scipy. Running only — cycling/swimming efforts are never
used here (filter upstream via :func:`extract_efforts_from_activities`).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import cast

from domain.physiology.threshold_pace import EffortPoint, estimate_threshold_pace

RIEGEL_EXPONENT: float = 1.06

# Standard race distances: (label, metres).
STANDARD_DISTANCES_M: tuple[tuple[str, int], ...] = (
    ("5K", 5000),
    ("10K", 10000),
    ("half_marathon", 21097),
    ("marathon", 42195),
)


def riegel_predict(time_s: float, distance_m: float, target_distance_m: float) -> float:
    """Predict finish time at ``target_distance_m`` from a known effort.

    T2 = T1 * (D2 / D1) ** 1.06. Raises ``ValueError`` on non-positive inputs.
    """
    if time_s <= 0 or distance_m <= 0 or target_distance_m <= 0:
        raise ValueError("time_s, distance_m and target_distance_m must be positive")
    return time_s * (target_distance_m / distance_m) ** RIEGEL_EXPONENT


def predict_distances(recent_time_s: float, recent_distance_m: float) -> list[dict[str, object]]:
    """Riegel predictions for every standard race distance."""
    out: list[dict[str, object]] = []
    for label, distance in STANDARD_DISTANCES_M:
        time_s = riegel_predict(recent_time_s, recent_distance_m, distance)
        out.append(
            {
                "label": label,
                "distance_m": distance,
                "time_s": round(time_s, 1),
                "pace_s_per_km": round(time_s / distance * 1000, 1),
            }
        )
    return out


def critical_speed_predict(efforts: Sequence[EffortPoint]) -> dict[str, object]:
    """Cross-check fit via the critical-speed model.

    Reuses :func:`estimate_threshold_pace` for confidence / data-sufficiency,
    then extracts W' (the regression intercept) for time prediction.
    """
    base = estimate_threshold_pace(efforts)
    if not base["data_sufficient"]:
        return _no_cs(base["effort_count"])
    valid = sorted(
        (e for e in efforts if e.distance_m > 100 and e.duration_s > 30),
        key=lambda e: e.duration_s,
    )
    cs, w_prime = _fit_distance_time(valid)
    return {
        "critical_speed_ms": round(cs, 3),
        "w_prime_m": round(w_prime, 1),
        "threshold_pace_s_per_km": base["threshold_pace_s_per_km"],
        "confidence": base["confidence"],
        "data_sufficient": True,
        "method": "critical_speed_model",
        "effort_count": base["effort_count"],
    }


def critical_speed_time(
    critical_speed_ms: float, w_prime_m: float, target_distance_m: float
) -> float | None:
    """Predicted time at ``target_distance_m`` from a CS / W' fit.

    ``time = (D - W') / CS``. Below W' (pure-sprint regime) the model is invalid,
    so fall back to the threshold-pace ceiling ``D / CS``.
    """
    if critical_speed_ms <= 0:
        return None
    if target_distance_m <= w_prime_m:
        return target_distance_m / critical_speed_ms
    return (target_distance_m - w_prime_m) / critical_speed_ms


def select_basis_from_prs(
    prs: Sequence[dict[str, object]],
) -> dict[str, object] | None:
    """Pick the effort anchoring Riegel from running personal records.

    Prefers the longest standard distance up to the half marathon (most
    endurance-representative), falling back to any available distance.
    """
    valid = [p for p in prs if _num(p.get("distance_m")) > 0 and _num(p.get("best_value")) > 0]
    if not valid:
        return None
    candidates = [p for p in valid if _num(p["distance_m"]) <= 21097] or valid
    best = max(candidates, key=lambda p: _num(p["distance_m"]))
    dist = _num(best["distance_m"])
    return {
        "distance_m": dist,
        "time_s": _num(best["best_value"]),
        "source_pr_distance_m": int(dist),
    }


def predict_race(
    recent_time_s: float,
    recent_distance_m: float,
    efforts: Sequence[EffortPoint] = (),
) -> dict[str, object]:
    """Combine Riegel and critical-speed into a race prediction bundle.

    Returns ``{predictions, basis, confidence, data_sufficient}``. Running only.
    """
    if recent_time_s <= 0 or recent_distance_m <= 0:
        return {"predictions": [], "basis": None, "confidence": None, "data_sufficient": False}

    riegel = predict_distances(recent_time_s, recent_distance_m)
    cs_fit = critical_speed_predict(efforts) if efforts else _no_cs(0)
    predictions = [_with_cross_check(entry, cs_fit) for entry in riegel]

    return {
        "predictions": predictions,
        "basis": {
            "method": "riegel",
            "recent_time_s": float(recent_time_s),
            "recent_distance_m": float(recent_distance_m),
            "exponent": RIEGEL_EXPONENT,
            "cross_check": cs_fit,
        },
        "confidence": _overall_confidence(predictions, cs_fit, recent_distance_m),
        "data_sufficient": True,
    }


def _with_cross_check(entry: dict[str, object], cs_fit: dict[str, object]) -> dict[str, object]:
    if not cs_fit["data_sufficient"]:
        return entry
    cs = float(cast(float, cs_fit["critical_speed_ms"]))
    w_prime = float(cast(float, cs_fit["w_prime_m"]))
    distance = float(cast(float, entry["distance_m"]))
    cs_time = critical_speed_time(cs, w_prime, distance)
    if cs_time is None:
        return entry
    riegel_time = float(cast(float, entry["time_s"]))
    entry = {**entry, "method": "riegel"}
    entry["cross_check"] = {
        "method": "critical_speed",
        "time_s": round(cs_time, 1),
        "pace_s_per_km": round(cs_time / distance * 1000, 1),
        "delta_pct": round((cs_time - riegel_time) / riegel_time * 100, 1),
    }
    return entry


def _overall_confidence(
    predictions: list[dict[str, object]],
    cs_fit: dict[str, object],
    basis_distance_m: float,
) -> str:
    if not cs_fit["data_sufficient"]:
        return "low" if basis_distance_m < 3000 else "medium"
    nearest = min(
        predictions, key=lambda p: abs(float(cast(float, p["distance_m"])) - basis_distance_m)
    )
    cross = nearest.get("cross_check")
    # Missing cross-check at the nearest distance → medium band (delta 7%).
    delta = abs(_num(cast(dict[str, object], cross)["delta_pct"])) if cross is not None else 7.0
    return "high" if delta < 5 else ("medium" if delta < 10 else "low")


def _no_cs(effort_count: object) -> dict[str, object]:
    return {
        "critical_speed_ms": None,
        "w_prime_m": None,
        "threshold_pace_s_per_km": None,
        "confidence": None,
        "data_sufficient": False,
        "method": None,
        "effort_count": effort_count,
    }


def _num(value: object) -> float:
    if isinstance(value, int | float):
        return float(value)
    return 0.0


def _fit_distance_time(points: list[EffortPoint]) -> tuple[float, float]:
    """Least-squares fit of ``distance = CS * time + W'``. Returns ``(CS, W')``."""
    n = len(points)
    if n < 2:
        return 0.0, 0.0
    sum_x = sum(p.duration_s for p in points)
    sum_y = sum(p.distance_m for p in points)
    sum_xy = sum(p.duration_s * p.distance_m for p in points)
    sum_x2 = sum(p.duration_s**2 for p in points)
    denom = n * sum_x2 - sum_x**2
    if denom == 0:
        return 0.0, 0.0
    slope = (n * sum_xy - sum_x * sum_y) / denom
    return slope, (sum_y - slope * sum_x) / n
