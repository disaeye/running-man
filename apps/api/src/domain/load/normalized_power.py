from collections.abc import Sequence
from math import pow

from .constants import NP_WINDOW_SIZE

FOURTH_POWER = 4.0


def normalized_power(watts: Sequence[float]) -> float | None:
    if len(watts) < NP_WINDOW_SIZE:
        return None

    rolling_total = sum(watts[:NP_WINDOW_SIZE])
    rolling_averages = [rolling_total / NP_WINDOW_SIZE]

    for sample_index in range(NP_WINDOW_SIZE, len(watts)):
        rolling_total += watts[sample_index] - watts[sample_index - NP_WINDOW_SIZE]
        rolling_averages.append(rolling_total / NP_WINDOW_SIZE)

    # 4th power captures metabolic cost of intensity variation.
    weighted_mean = sum(power**FOURTH_POWER for power in rolling_averages) / len(rolling_averages)
    return pow(weighted_mean, 1.0 / FOURTH_POWER)
