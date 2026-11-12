import statistics
from itertools import pairwise
from typing import Final

from domain.run_classification.analysis import StreamFeatures
from domain.run_classification.models import ActivityEvidence
from domain.run_classification.utils import distance, duration, speed

SHORT_WORK_S: Final = 120.0
VO2MAX_WORK_S: Final = 240.0
LONG_WORK_S: Final = 4500.0
LONG_CONTINUOUS_WORK_S: Final = 600.0
RACE_WORK_S: Final = 1200.0
PROGRESSION_MIN_GAIN: Final = 1.05
FARTLEK_MIN_DISTANCE_CV: Final = 0.15
FARTLEK_MIN_SPEED_CV: Final = 0.12


class StimulusContext:
    """Measurements taken only from work segments."""

    def __init__(self, work: list[dict[str, object]]) -> None:
        durations = [duration(item) for item in work]
        self.durations = durations
        self.total_s = sum(durations)
        self.severe_s = sum(
            duration(item) for item in work if item.get("domain") in {"mt2_wmax", "above_wmax"}
        )
        self.mid_s = sum(duration(item) for item in work if item.get("domain") == "mt1_mt2")
        self.low_s = sum(duration(item) for item in work if item.get("domain") == "below_mt1")
        self.above_wmax_s = sum(
            duration(item) for item in work if item.get("domain") == "above_wmax"
        )
        self.median_s = statistics.median(durations)
        self.min_s = min(durations)
        self.domains = {str(item.get("domain")) for item in work}
        self.speeds = [speed(item) for item in work if speed(item) > 0]
        self.paces = _pace_values(work)
        self.pace_cv = (
            statistics.pstdev(self.paces) / statistics.fmean(self.paces)
            if len(self.paces) > 1
            else 0.0
        )


def _pace_values(work: list[dict[str, object]]) -> list[float]:
    result: list[float] = []
    for item in work:
        value = item.get("pace_s_km")
        if isinstance(value, bool) or not isinstance(value, int | float):
            continue
        pace = float(value)
        if pace > 0:
            result.append(pace)
    return result


def detect_structure(
    work: list[dict[str, object]],
    recovery: list[dict[str, object]],
    features: StreamFeatures,
    segments: list[dict[str, object]],
) -> str:
    """Classify into continuous / interval / progression / fartlek / complex / unclear."""
    if not segments or not work:
        return "unclear"
    if len(work) >= 2:
        return _multi_work_structure(work, recovery, features, segments)
    return _continuous_shape(features, work)


def _multi_work_structure(
    work: list[dict[str, object]],
    recovery: list[dict[str, object]],
    features: StreamFeatures,
    segments: list[dict[str, object]],
) -> str:
    durations = [duration(item) for item in work]
    if max(durations) >= LONG_CONTINUOUS_WORK_S and min(durations) <= SHORT_WORK_S:
        return "complex"
    if not _measured_recovery_boundary(work, recovery, segments):
        return "unclear"
    if _fartlek_shape(work, features):
        return "fartlek"
    return "interval"


def _measured_recovery_boundary(
    work: list[dict[str, object]],
    recovery: list[dict[str, object]],
    segments: list[dict[str, object]],
) -> bool:
    """A measured recovery row delimits the repeated work bouts."""
    starts = [_number(item.get("start_s")) for item in work]
    ends = [_number(item.get("end_s")) for item in work]
    first, last = min(starts), max(ends)
    for item in [*recovery, *segments]:
        if item.get("role") != "recovery":
            continue
        duration_s = duration(item)
        distance_m = distance(item)
        if duration_s >= 10.0 and distance_m > 0:
            return True
        if first < _number(item.get("start_s")) < last and duration_s > 0:
            return True
    return False


def _fartlek_shape(work: list[dict[str, object]], features: StreamFeatures) -> bool:
    """Fast/slow alternation with uneven work bouts and no equal-length repeats."""
    distances = [distance(item) for item in work if distance(item) > 0]
    if len(distances) < 2:
        return False
    distance_cv = statistics.pstdev(distances) / statistics.fmean(distances)
    speeds = [speed(item) for item in work if speed(item) > 0]
    alternations = sum(
        1 for left, right in pairwise(speeds) if left > 0 and abs(right - left) >= left * 0.15
    )
    equal_repeats = any(
        left > 0 and abs(right - left) <= left * 0.05 for left, right in pairwise(distances)
    )
    return (
        distance_cv >= FARTLEK_MIN_DISTANCE_CV
        and alternations >= 1
        and features.speed_cv >= FARTLEK_MIN_SPEED_CV
        and not equal_repeats
    )


def _continuous_shape(features: StreamFeatures, work: list[dict[str, object]]) -> str:
    """A progression needs a strictly rising speed profile and a real end gain."""
    if features.monotonic and _work_speed_increasing(work):
        return "progression"
    if len(work) == 1 and features.alternating and features.speed_cv >= 0.25:
        return "unclear"
    return "continuous"


def _work_speed_increasing(work: list[dict[str, object]]) -> bool:
    ordered = sorted(work, key=lambda item: _number(item.get("start_s")))
    speeds = [speed(item) for item in ordered if speed(item) > 0]
    if len(speeds) < 2:
        return True
    return speeds[-1] >= speeds[0] * PROGRESSION_MIN_GAIN


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)


def detect_session_type(
    work: list[dict[str, object]],
    recovery: list[dict[str, object]],
    structure: str,
    features: StreamFeatures,
) -> str:
    _ = features
    if structure in {"continuous", "progression", "fartlek", "complex"}:
        return structure
    if structure == "unclear":
        return "interval_unspecified" if len(work) >= 2 else "unclear"
    context = StimulusContext(work)
    recovery_s = sum(duration(item) for item in recovery)
    full_recovery = recovery_s >= context.total_s * 0.5
    fast_work = context.median_s <= SHORT_WORK_S
    severe_work = context.severe_s >= context.total_s * 0.4
    if fast_work and full_recovery and severe_work:
        return "repetition"
    return "interval"


def detect_pacing_pattern(structure: str, features: StreamFeatures) -> str:
    fixed = {
        "interval": "intermittent",
        "complex": "mixed",
        "fartlek": "variable",
        "unclear": "unclear",
    }
    if structure in fixed:
        return fixed[structure]
    if features.monotonic:
        fast_finish = features.third_speeds[2] > features.third_speeds[0] * 1.1
        return "negative_split" if fast_finish else "progressive"
    if features.third_speeds[2] > features.third_speeds[0] * 1.05:
        return "negative_split"
    if features.speed_cv >= 0.35:
        return "variable"
    if features.speed_cv <= 0.12:
        return "steady"
    return "unclear"


def detect_stimulus(
    work: list[dict[str, object]],
    structure: str,
    session_type: str = "continuous",
) -> str:
    """Derive the primary stimulus only from measured work segments."""
    if not work or structure == "unclear" or session_type == "interval_unspecified":
        return "unclear"
    context = StimulusContext(work)
    if session_type == "repetition":
        return "speed_economy" if context.above_wmax_s > 0 else "neuromuscular"
    if structure in {"interval", "complex"}:
        return interval_stimulus(context)
    if structure == "progression":
        return "pacing_skill"
    return continuous_stimulus(context)


def interval_stimulus(context: StimulusContext) -> str:
    short_s = sum(value for value in context.durations if value <= SHORT_WORK_S)
    if short_s > context.total_s * 0.25 and context.severe_s > 0:
        return "neuromuscular"
    if context.median_s <= VO2MAX_WORK_S:
        return "vo2max"
    return "lactate_threshold"


def continuous_stimulus(context: StimulusContext) -> str:
    """Use work-segment duration, domains and pace variation only."""
    if context.total_s >= LONG_WORK_S and context.severe_s <= context.total_s * 0.15:
        return "aerobic_endurance"
    if (
        context.total_s >= RACE_WORK_S
        and context.severe_s >= context.total_s * 0.6
        and context.pace_cv < 0.08
    ):
        return "race_specific"
    if "mt1_mt2" in context.domains and context.severe_s >= context.total_s * 0.2:
        return "lactate_threshold"
    if "mt2_wmax" in context.domains and context.severe_s >= context.total_s * 0.35:
        return "vo2max"
    if context.total_s <= 2700 and context.pace_cv >= 0.12 and _peak_speed_gain(context) >= 1.2:
        return "speed_economy"
    if context.severe_s <= context.total_s * 0.2:
        return "aerobic_base"
    return "pacing_skill" if context.pace_cv >= 0.3 else "aerobic_endurance"


def _peak_speed_gain(context: StimulusContext) -> float:
    if not context.speeds:
        return 0.0
    return max(context.speeds) / statistics.median(context.speeds)


def detect_modifiers(evidence: ActivityEvidence, features: StreamFeatures) -> list[str]:
    distance_m = float(evidence.distance_m)
    duration_s = float(evidence.duration_s)
    gain = _number(evidence.raw_data.get("total_elevation_gain"))
    gain_ratio = gain / distance_m if distance_m > 0 else 0.0
    hill = gain_ratio >= 0.01 and features.grade_median_pct >= 3.0
    fast_finish = features.monotonic and features.third_speeds[2] > features.third_speeds[0] * 1.1
    negative_split = not fast_finish and features.third_speeds[2] > features.third_speeds[0] * 1.05
    is_race = evidence.is_race
    linked = evidence.linked_prescription is not None
    conditions = (
        ("long", distance_m >= 15000 or duration_s >= 5400),
        ("progression", features.monotonic and not fast_finish),
        ("fast_finish", fast_finish),
        ("negative_split", negative_split),
        ("hill", hill),
        ("treadmill", evidence.sport in {"virtual_run", "treadmill_run", "indoor_run"}),
        ("race", is_race),
        ("linked_plan", linked),
    )
    return [modifier for modifier, active in conditions if active]


def secondary_stimuli(
    work: list[dict[str, object]], stimulus: str, modifiers: list[str]
) -> list[str]:
    values: list[str] = []
    domains = {str(item.get("domain")) for item in work}
    if stimulus != "vo2max" and "mt2_wmax" in domains:
        values.append("vo2max")
    if stimulus != "lactate_threshold" and "mt1_mt2" in domains:
        values.append("lactate_threshold")
    if stimulus == "speed_economy" and "above_wmax" in domains:
        values.append("neuromuscular")
    if stimulus != "pacing_skill" and any(
        item in modifiers for item in ("progression", "negative_split", "fast_finish")
    ):
        values.append("pacing_skill")
    return values
