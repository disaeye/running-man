import bisect
import statistics
from dataclasses import dataclass
from itertools import pairwise
from typing import Final

from domain.run_classification.domains import raw_zone_domain_residence_s
from domain.run_classification.models import ActivityEvidence

BIN_S: Final = 5
MAX_STREAM_GAP_S: Final = 30.0
MIN_MOVING_SPEED: Final = 0.5


@dataclass(frozen=True, slots=True)
class SpeedBlock:
    start_s: float
    end_s: float
    duration_s: float
    mean_speed: float
    level: str


@dataclass(frozen=True, slots=True)
class StreamFeatures:
    speed_bins: list[float]
    third_speeds: tuple[float, float, float]
    speed_increase_pct: float
    monotonic: bool
    alternating: bool
    speed_cv: float
    grade_median_pct: float
    high_blocks: list[SpeedBlock]
    low_blocks: list[SpeedBlock]


def domain_residence_s(raw_data: dict[str, object]) -> dict[str, float]:
    return raw_zone_domain_residence_s(raw_data)


def cumulative_distance(
    evidence: ActivityEvidence,
) -> tuple[list[float], list[float]]:
    distance_samples = evidence.streams.get("distance", [])
    speed_samples = evidence.streams.get("speed", [])
    if distance_samples and len(distance_samples) >= len(speed_samples) * 0.8:
        return [item[0] for item in distance_samples], [item[1] for item in distance_samples]
    times: list[float] = []
    distances: list[float] = []
    total = 0.0
    previous_time: float | None = None
    previous_speed: float | None = None
    for elapsed, raw_speed in speed_samples:
        speed = max(0.0, raw_speed)
        if previous_time is not None and previous_speed is not None:
            delta = min(max(0.0, elapsed - previous_time), MAX_STREAM_GAP_S)
            total += (previous_speed + speed) / 2.0 * delta
        times.append(elapsed)
        distances.append(total)
        previous_time, previous_speed = elapsed, speed
    return times, distances


def distance_between(times: list[float], distances: list[float], start: float, end: float) -> float:
    if len(times) < 2 or end <= start:
        return 0.0
    first = max(0.0, start)
    last = min(times[-1], end)
    total = 0.0
    for index in range(1, len(times)):
        left = max(first, times[index - 1])
        right = min(last, times[index])
        if right <= left:
            continue
        fraction = (right - left) / (times[index] - times[index - 1])
        total += fraction * max(0.0, distances[index] - distances[index - 1])
    return total


def stream_mean(samples: list[tuple[float, float]], start: float, end: float) -> float | None:
    values = [value for elapsed, value in samples if start <= elapsed < end]
    return statistics.fmean(values) if values else None


def stream_features(evidence: ActivityEvidence) -> StreamFeatures:
    speed_bins = _speed_bins(evidence)
    moving = [value for value in speed_bins if value > MIN_MOVING_SPEED]
    if not moving:
        return StreamFeatures(
            speed_bins=[],
            third_speeds=(0.0, 0.0, 0.0),
            speed_increase_pct=0.0,
            monotonic=False,
            alternating=False,
            speed_cv=0.0,
            grade_median_pct=0.0,
            high_blocks=[],
            low_blocks=[],
        )
    third = max(1, len(speed_bins) // 3)
    thirds = (
        statistics.fmean(speed_bins[:third]),
        statistics.fmean(speed_bins[third : 2 * third]),
        statistics.fmean(speed_bins[2 * third :]),
    )
    increase = (thirds[2] / thirds[0] - 1.0) * 100.0 if thirds[0] > 0 else 0.0
    # A progression needs every third at least as fast as the previous one;
    # a slower middle third is a surge or a variable run, not a monotone build.
    monotonic = thirds[1] >= thirds[0] * 0.995 and thirds[2] >= thirds[1] * 1.02
    high, low = _speed_blocks(speed_bins)
    alternating = _alternating_blocks(high, low)
    times, distances = cumulative_distance(evidence)
    grades = _positive_grades(times, distances, evidence.streams.get("altitude", []))
    mean_speed = statistics.fmean(moving)
    return StreamFeatures(
        speed_bins=speed_bins,
        third_speeds=thirds,
        speed_increase_pct=round(increase, 1),
        monotonic=monotonic and increase >= 8.0,
        alternating=alternating,
        speed_cv=round(statistics.pstdev(moving) / mean_speed, 3),
        grade_median_pct=round(statistics.fmean(grades), 2) if grades else 0.0,
        high_blocks=high,
        low_blocks=low,
    )


def _alternating_blocks(high: list[SpeedBlock], low: list[SpeedBlock]) -> bool:
    """At least two fast bouts separated by slower running."""
    if len(high) < 2 or not low:
        return False
    ordered = sorted(
        [(item.start_s, "high") for item in high] + [(item.start_s, "low") for item in low]
    )
    changes = sum(1 for left, right in pairwise(ordered) if left[1] != right[1])
    return changes >= 2


def _speed_bins(evidence: ActivityEvidence) -> list[float]:
    count = max(1, evidence.duration_s // BIN_S + (1 if evidence.duration_s % BIN_S else 0))
    sums = [0.0] * count
    counts = [0] * count
    for elapsed, value in evidence.streams.get("speed", []):
        if elapsed < 0 or elapsed >= evidence.duration_s:
            continue
        index = int(elapsed // BIN_S)
        sums[index] += value
        counts[index] += 1
    last_value = 0.0
    last_time = -BIN_S * 3.0
    result: list[float] = []
    for index in range(count):
        center = index * BIN_S
        if counts[index]:
            last_value = sums[index] / counts[index]
            last_time = center
        elif center - last_time > 10.0:
            last_value = 0.0
        result.append(last_value)
    return result


def _speed_blocks(speed_bins: list[float]) -> tuple[list[SpeedBlock], list[SpeedBlock]]:
    moving = [value for value in speed_bins if value > MIN_MOVING_SPEED]
    center = statistics.median(moving) if moving else 0.0
    high: list[SpeedBlock] = []
    low: list[SpeedBlock] = []
    for level, threshold, output in (
        ("high", center * 1.15, high),
        ("low", center * 0.85, low),
    ):
        start: int | None = None
        for index in range(len(speed_bins) + 1):
            active = (
                index < len(speed_bins)
                and speed_bins[index] > 0
                and (
                    speed_bins[index] >= threshold
                    if level == "high"
                    else speed_bins[index] <= threshold
                )
            )
            if active and start is None:
                start = index
            elif not active and start is not None:
                values = [value for value in speed_bins[start:index] if value > 0]
                duration = (index - start) * BIN_S
                if duration >= 30 and values:
                    output.append(
                        SpeedBlock(
                            start * BIN_S,
                            index * BIN_S,
                            duration,
                            statistics.fmean(values),
                            level,
                        )
                    )
                start = None
    return high, low


def _positive_grades(
    times: list[float],
    distances: list[float],
    altitudes: list[tuple[float, float]],
) -> list[float]:
    if not altitudes or len(times) < 2:
        return []
    altitude_times = [item[0] for item in altitudes]
    grades: list[float] = []
    for index in range(1, len(times)):
        horizontal = distances[index] - distances[index - 1]
        position = bisect.bisect_left(altitude_times, times[index])
        if horizontal <= 0 or position < 1 or position >= len(altitudes):
            continue
        grade = (altitudes[position][1] - altitudes[position - 1][1]) / horizontal * 100.0
        if 0 < grade <= 45:
            grades.append(grade)
    return grades
