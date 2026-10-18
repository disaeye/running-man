"""Per-metric input windows for the physiology calculation.

The window a metric is computed over is a product parameter recorded in
`contracts/v1/algorithms.yaml`. Algorithm versions live in `domain.algorithms`;
this module only answers "how far back does this metric look".
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import cast

from domain.algorithms import algorithm_row
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric


def physiology_window_days(metric: Metric) -> int:
    row = algorithm_row(Algorithm.PHYSIOLOGY)
    calculations = cast(Sequence[Mapping[str, object]], row["calculations"])
    for calculation in calculations:
        if str(calculation["key"]) == metric.value:
            return int(cast(int, calculation["input_window_days"]))
    message = f"physiology calculation window missing for {metric.value}"
    raise KeyError(message)
