from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from domain.generated.algorithms import ALGORITHM_DEFINITIONS, Algorithm
from domain.generated.metrics import Metric


@dataclass(frozen=True, slots=True)
class AlgorithmContract:
    key: Algorithm
    version: str
    input_window_days: int


def algorithm_contract(key: Algorithm) -> AlgorithmContract:
    row = _algorithm_row(key)
    return AlgorithmContract(
        key=key,
        version=str(row["version"]),
        input_window_days=int(cast(int, row["input_window_days"])),
    )


def physiology_window_days(metric: Metric) -> int:
    row = _algorithm_row(Algorithm.PHYSIOLOGY)
    calculations = cast(Sequence[Mapping[str, object]], row["calculations"])
    for calculation in calculations:
        if str(calculation["key"]) == metric.value:
            return int(cast(int, calculation["input_window_days"]))
    message = f"physiology calculation window missing for {metric.value}"
    raise KeyError(message)


def _algorithm_row(key: Algorithm) -> Mapping[str, object]:
    for row in cast(Sequence[Mapping[str, object]], ALGORITHM_DEFINITIONS):
        if str(row["key"]) == key.value:
            return row
    message = f"algorithm contract missing for {key.value}"
    raise KeyError(message)
