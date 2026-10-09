def compute_hrv_factor(today_hrv: float | None, baseline_hrv: float | None) -> float:
    """Score HRV readiness from 0-100 using today's RMSSD vs 7-day baseline."""
    if today_hrv is None or baseline_hrv is None:
        return 50.0
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


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))
