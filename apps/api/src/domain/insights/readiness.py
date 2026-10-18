from datetime import date, datetime, timedelta
from decimal import Decimal
from statistics import mean
from typing import Final

from domain.insights.wellness_window import baseline_days, observation_day
from domain.load.constants import (
    READINESS_WEIGHT_ATL_VELOCITY,
    READINESS_WEIGHT_HRV,
    READINESS_WEIGHT_RHR,
    READINESS_WEIGHT_SLEEP,
    READINESS_WEIGHT_TSB,
)

# Wellness fields readiness reads; a row counts as an observation when any is set.
_WELLNESS_KEYS: Final = ("sleep_secs", "resting_hr", "hrv")

# How stale a daily load row may be and still describe the target day. The PMC
# series is written by a recompute job, so it can trail the target date.
LOAD_WINDOW_DAYS: Final = 3

Factor = dict[str, str | int]
Row = dict[str, object]
Readiness = dict[str, object]
Recommendation = dict[str, object]


def compute_readiness(target_day: date, wellness: list[Row], loads: list[Row]) -> Readiness:
    """Readiness for ``target_day``.

    A factor with no measurement contributes nothing — neither a score nor a
    weight. Filling missing factors with 50 and keeping their weight compressed
    every outcome towards the middle: with only load data available, TSB +20
    scored 65 and TSB -20 scored 41, so the score could never leave the
    "moderate" band and an exhausted athlete was never told to rest.

    The load factors describe the state at the *start* of the day. Readiness
    answers "what should I do now", and a session already run this morning
    lowers TSB by roughly 12 points — most of the ±20 band the recommendation
    rules move within.
    """
    by_day = {_as_date(row["day"]): row for row in wellness}
    load_by_day = {_as_date(row["day"]): row for row in loads}
    # Only days carrying a measurement count: the row for the target day is
    # usually created but entirely NULL, and must not shadow yesterday's data.
    observed_days = tuple(
        day
        for day, row in by_day.items()
        if any(_num(row, key) is not None for key in _WELLNESS_KEYS)
    )
    day = observation_day(target_day, observed_days)
    today = by_day.get(day) if day is not None else None
    scored = [
        _sleep_factor(target_day, today, by_day),
        _rhr_factor(target_day, today, by_day),
        _tsb_factor(target_day, load_by_day),
        _atl_velocity_factor(target_day, load_by_day),
        _hrv_factor(target_day, today, by_day),
    ]
    factors = [factor for factor, _weight in scored]
    weights = [weight for _factor, weight in scored]
    score = _weighted_score(factors, weights)
    level, max_intensity, recommendation = _readiness_band(score)
    return {
        "score": score,
        "level": level,
        "factors": [_public_factor(factor) for factor in factors[:5]],
        "recommendation": recommendation,
        "max_intensity": max_intensity,
        "data_sufficient": any(weight > 0.0 for weight in weights),
        "observed_on": day,
    }

def _sleep_factor(
    target_day: date, today: Row | None, by_day: dict[date, Row]
) -> tuple[Factor, float]:
    sleep_secs = _num(today, "sleep_secs")
    history = [
        _num(by_day.get(day), "sleep_secs")
        for day in baseline_days(target_day, tuple(by_day))
    ]
    baseline = _avg([value for value in history if value])
    if sleep_secs is None or baseline is None:
        return _factor("sleep", 50, "neutral", "睡眠数据不足"), 0.0
    ratio = sleep_secs / max(baseline, 1)
    score = _clamp(round(50 + (ratio - 0.85) * 160))
    return (
        _factor(
            "sleep",
            score,
            _impact(score),
            f"睡眠 {sleep_secs / 3600:.1f}h，7日均值 {baseline / 3600:.1f}h",
        ),
        READINESS_WEIGHT_SLEEP,
    )


def _rhr_factor(
    target_day: date, today: Row | None, by_day: dict[date, Row]
) -> tuple[Factor, float]:
    rhr = _num(today, "resting_hr")
    history = [
        _num(by_day.get(day), "resting_hr")
        for day in baseline_days(target_day, tuple(by_day))
    ]
    baseline = _avg([value for value in history if value])
    if rhr is None or baseline is None:
        return _factor("resting_hr", 50, "neutral", "静息心率数据不足"), 0.0
    delta = rhr - baseline
    score = _clamp(round(85 - max(delta, -5) * 7))
    return (
        _factor(
            "resting_hr",
            score,
            _impact(score),
            f"静息心率 {rhr:.0f}，较7日均值 {delta:+.0f}",
        ),
        READINESS_WEIGHT_RHR,
    )


def _tsb_factor(target_day: date, load_by_day: dict[date, Row]) -> tuple[Factor, float]:
    """TSB at the start of ``target_day``: the previous day's closing value."""
    entry_day = observation_day(
        target_day - timedelta(days=1),
        tuple(load_by_day),
        max_age_days=LOAD_WINDOW_DAYS,
    )
    tsb = _num(load_by_day.get(entry_day), "tsb") if entry_day is not None else None
    if tsb is None:
        return _factor("tsb", 50, "neutral", "TSB 数据不足"), 0.0
    score = _clamp(round(80 + tsb * 2 if tsb >= 0 else 80 + tsb * 3))
    return _factor("tsb", score, _impact(score), f"TSB {tsb:+.1f}"), READINESS_WEIGHT_TSB


def _atl_velocity_factor(
    target_day: date, loads: dict[date, Row]
) -> tuple[Factor, float]:
    """Seven-day change in ATL, measured to the start of the target day."""
    latest = observation_day(
        target_day - timedelta(days=1), tuple(loads), max_age_days=LOAD_WINDOW_DAYS
    )
    today = _num(loads.get(latest), "atl") if latest is not None else None
    week_ago = (
        _num(loads.get(latest - timedelta(days=7)), "atl") if latest is not None else None
    )
    if today is None or week_ago is None:
        return _factor("atl_velocity", 50, "neutral", "ATL 变化数据不足"), 0.0
    velocity = today - week_ago
    score = _clamp(round(85 - max(velocity, 0) * 3 + min(velocity, 0)))
    return (
        _factor("atl_velocity", score, _impact(score), f"ATL 7日变化 {velocity:+.1f}"),
        READINESS_WEIGHT_ATL_VELOCITY,
    )

def _hrv_factor(
    target_day: date, today: Row | None, by_day: dict[date, Row]
) -> tuple[Factor, float]:
    hrv = _num(today, "hrv")
    history = [
        _num(by_day.get(day), "hrv")
        for day in baseline_days(target_day, tuple(by_day))
    ]
    baseline = _avg([value for value in history if value])
    if hrv is None or baseline is None:
        return _factor("hrv", 50, "neutral", "HRV 数据不足"), 0.0
    score = round(_compute_hrv_score(hrv, baseline))
    return _factor(
        "hrv", score, _impact(score), f"HRV {hrv:.0f}，7日均值 {baseline:.0f}"
    ), READINESS_WEIGHT_HRV

def _compute_hrv_score(today_hrv: float, baseline_hrv: float) -> float:
    if today_hrv <= 0 or baseline_hrv <= 0:
        return 50.0
    ratio = today_hrv / baseline_hrv
    if ratio >= 1.03:
        return 100.0
    if ratio >= 1.0:
        return _clamp(90.0 + (ratio - 1.0) / 0.03 * 10.0)
    if ratio >= 0.9:
        return _clamp(40.0 + (ratio - 0.9) / 0.1 * 50.0)
    if ratio >= 0.8:
        return _clamp(20.0 + (ratio - 0.8) / 0.1 * 20.0)
    return _clamp(ratio / 0.8 * 20.0)

def _readiness_band(score: int) -> tuple[str, str, str]:
    # The band table and its lookup are shared with the recommendation module,
    # which needs the same thresholds to choose a session type. Imported here
    # rather than at module scope because that module imports ``Readiness`` from
    # this one.
    from domain.insights.recommendation import band_for_score  # noqa: PLC0415

    band = band_for_score(score)
    return str(band["level"]), str(band["max_intensity"]), str(band["recommendation"])

def _factor(name: str, score: int, impact: str, detail: str) -> Factor:
    return {"name": name, "score": _clamp(score), "impact": impact, "detail": detail}

def _public_factor(factor: Factor) -> dict[str, str]:
    return {
        "name": str(factor["name"]),
        "impact": str(factor["impact"]),
        "detail": str(factor["detail"]),
    }

def _weighted_score(factors: list[Factor], weights: list[float]) -> int:
    total_weight = sum(weights)
    if total_weight <= 0:
        return 50
    total = sum(
        int(factor["score"]) * weight for factor, weight in zip(factors, weights, strict=True)
    )
    return _clamp(round(total / total_weight))

def _impact(score: int) -> str:
    return "positive" if score >= 70 else "negative" if score < 45 else "neutral"

def _avg(values: list[float]) -> float | None:
    return mean(values) if values else None

def _num(row: Row | None, key: str) -> float | None:
    value = None if row is None else row.get(key)
    if value is None:
        return None
    return float(value) if isinstance(value, int | float | Decimal | str) else None

def _as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value if isinstance(value, date) else date.fromisoformat(str(value))

def _clamp(value: float | int) -> int:
    return max(0, min(100, int(value)))
