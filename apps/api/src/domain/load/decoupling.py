from collections.abc import Sequence

from .constants import MAX_VIABILITY_INDEX, MIN_DURATION_SECONDS
from .normalized_power import normalized_power


def _efficiency_factor(effort: Sequence[float], cardio: Sequence[float]) -> float | None:
    np = normalized_power(effort)
    if np is None:
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
) -> float | None:
    if len(effort_values) != len(cardio_values):
        return None
    if len(effort_values) < MIN_DURATION_SECONDS:
        return None

    vi = _variability_index(effort_values)
    if vi is None or vi > MAX_VIABILITY_INDEX:
        return None

    midpoint = len(effort_values) // 2
    ef_first = _efficiency_factor(effort_values[:midpoint], cardio_values[:midpoint])
    ef_second = _efficiency_factor(effort_values[midpoint:], cardio_values[midpoint:])

    if ef_first is None or ef_second is None or ef_first == 0.0:
        return None

    return (ef_first - ef_second) / ef_first * 100.0
