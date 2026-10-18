from collections.abc import Sequence
from typing import Final

from .constants import MAX_VIABILITY_INDEX, MIN_DURATION_SECONDS
from .normalized_power import normalized_power

# Two samples from different streams describe the same moment when their
# timestamps are at most this far apart. Devices record at 1 s, 3 s or 5 s.
PAIR_TOLERANCE_SECONDS: Final = 5.0


def pair_by_time(
    effort_times: Sequence[float],
    effort_values: Sequence[float],
    cardio_times: Sequence[float],
    cardio_values: Sequence[float],
    tolerance_s: float = PAIR_TOLERANCE_SECONDS,
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Pair two time-ordered series by timestamp.

    For each cardio sample this takes the nearest effort sample and keeps the
    pair when they are within ``tolerance_s``. Positional pairing —
    ``zip(effort[:n], cardio[:n])`` — compares one moment's speed to another
    moment's heart rate as soon as the two streams differ in rate or start
    offset, which is exactly what efficiency factor measures.
    """
    paired_effort: list[float] = []
    paired_cardio: list[float] = []
    index = 0
    count = len(effort_times)
    for cardio_time, cardio_value in zip(cardio_times, cardio_values):
        if count == 0:
            break
        while index + 1 < count and abs(effort_times[index + 1] - cardio_time) <= abs(
            effort_times[index] - cardio_time
        ):
            index += 1
        if abs(effort_times[index] - cardio_time) <= tolerance_s:
            paired_effort.append(effort_values[index])
            paired_cardio.append(cardio_value)
    return tuple(paired_effort), tuple(paired_cardio)


def efficiency_factor(effort: Sequence[float], cardio: Sequence[float]) -> float | None:
    """Normalised effort divided by average heart rate.

    Public because the activity load facts record it as a metric; there is one
    implementation so the stored value and the halves inside the decoupling
    calculation cannot diverge.
    """
    np = normalized_power(effort)
    if np is None or not cardio:
        return None
    avg_hr = sum(cardio) / len(cardio)
    if avg_hr == 0.0:
        return None
    return np / avg_hr


def _variability_index(effort: Sequence[float]) -> float | None:
    np = normalized_power(effort)
    if np is None:
        return None
    avg = sum(effort) / len(effort)
    if avg == 0.0:
        return None
    return np / avg


def aerobic_decoupling(
    effort_values: Sequence[float],
    cardio_values: Sequence[float],
    *,
    duration_s: float,
) -> float | None:
    """Aerobic decoupling across the first and second half of an effort.

    ``duration_s`` is the elapsed time the paired samples cover. The guard used
    to compare the *sample count* against a 1200-second minimum, which is only a
    duration when the stream happens to be 1 Hz: a 20-minute effort recorded at
    5 s intervals has 240 samples and was rejected, while a 30-minute effort at
    3 s intervals has 600 samples and a 50-minute one at 3 s creeps past the
    threshold while the real window is shorter than the intended 20 minutes.
    """
    if len(effort_values) != len(cardio_values):
        return None
    if duration_s < MIN_DURATION_SECONDS:
        return None

    vi = _variability_index(effort_values)
    if vi is None or vi > MAX_VIABILITY_INDEX:
        return None

    midpoint = len(effort_values) // 2
    ef_first = efficiency_factor(effort_values[:midpoint], cardio_values[:midpoint])
    ef_second = efficiency_factor(effort_values[midpoint:], cardio_values[midpoint:])

    if ef_first is None or ef_second is None or ef_first == 0.0:
        return None

    return (ef_first - ef_second) / ef_first * 100.0
