import statistics

from domain.run_classification.analysis import StreamFeatures, stream_mean
from domain.run_classification.models import ActivityEvidence
from domain.run_classification.schema import STIMULUS_CATALOG
from domain.run_classification.utils import duration, speed


def bind_stimulus_metrics(
    quality: dict[str, object],
    evidence: ActivityEvidence,
    work: list[dict[str, object]],
    features: StreamFeatures,
    stimulus: str,
) -> dict[str, object]:
    """把刺激目录声明的可量化指标写进每条结果的 ``quality``。"""
    result = dict(quality)
    total_s = sum(duration(item) for item in work)
    low_s = sum(duration(item) for item in work if item.get("domain") == "below_mt1")
    severe_s = sum(
        duration(item) for item in work if item.get("domain") in {"mt2_wmax", "above_wmax"}
    )
    speeds = [speed(item) for item in work if speed(item) > 0]
    result["low_domain_share"] = round(low_s / total_s, 3) if total_s > 0 else None
    result["time_in_domain_s"] = round(severe_s, 1)
    result["peak_speed_attainment"] = (
        round(max(speeds) / statistics.median(speeds), 3) if speeds else None
    )
    result["stride_consistency"] = _stride_consistency(evidence, work)
    result["monotonicity"] = 1.0 if features.monotonic else 0.0
    result["speed_increase_pct"] = features.speed_increase_pct
    result["last_domain_match"] = _last_domain_match(work, stimulus)
    result["hr_attainment"] = _hr_attainment(evidence, work)
    for key in STIMULUS_CATALOG[stimulus].quality_metrics:
        result.setdefault(key, None)
    return result


def _hr_attainment(evidence: ActivityEvidence, work: list[dict[str, object]]) -> float | None:
    """Work-weighted heart rate relative to the activity-date LTHR anchor."""
    lthr = evidence.threshold.get("lthr")
    if not isinstance(lthr, int | float) or isinstance(lthr, bool) or lthr <= 0:
        return None
    weighted: list[float] = []
    for item in work:
        elapsed_s = duration(item)
        if elapsed_s <= 0:
            continue
        heart_rate = item.get("avg_hr")
        measured_value: float | None
        if isinstance(heart_rate, int | float) and heart_rate > 0:
            measured_value = float(heart_rate)
        else:
            measured_value = stream_mean(
                evidence.streams.get("heart_rate", []),
                _number(item.get("start_s")),
                _number(item.get("end_s")),
            )
        if measured_value is not None and measured_value > 0:
            weighted.append(measured_value * elapsed_s)
    total_s = sum(duration(item) for item in work if duration(item) > 0)
    if not weighted or total_s <= 0:
        return None
    mean_hr = sum(weighted) / total_s
    return round(mean_hr / float(lthr), 3)


def _stride_consistency(evidence: ActivityEvidence, work: list[dict[str, object]]) -> float | None:
    cadence = evidence.streams.get("cadence", [])
    if not cadence or not work:
        return None
    values = [
        value
        for item in work
        if (
            value := stream_mean(
                cadence,
                _number(item.get("start_s")),
                _number(item.get("end_s")),
            )
        )
        is not None
        and value > 0
    ]
    if len(values) < 2:
        return None
    mean = statistics.fmean(values)
    if mean <= 0:
        return None
    return round(max(0.0, 1.0 - statistics.pstdev(values) / mean), 3)


def _last_domain_match(work: list[dict[str, object]], stimulus: str) -> float | None:
    if not work:
        return None
    ordered = sorted(work, key=lambda item: _number(item.get("start_s")))
    last = str(ordered[-1].get("domain") or "low_unspecified")
    target = STIMULUS_CATALOG[stimulus].target_domain
    return 1.0 if last == target else 0.0


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)
