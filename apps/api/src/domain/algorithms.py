"""Lookup over the generated algorithm registry.

Every algorithm's version lives in `contracts/v1/algorithms.yaml` and reaches the
code through `domain.generated.algorithms`. Computation code must read the
version from here rather than declaring its own: a second copy drifts, and a
stale version stamp means derived facts computed under a different algorithm are
never superseded.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from domain.generated.algorithms import ALGORITHM_DEFINITIONS, Algorithm


@dataclass(frozen=True, slots=True)
class AlgorithmContract:
    key: Algorithm
    version: str
    input_window_days: int


def algorithm_row(key: Algorithm) -> Mapping[str, object]:
    """The contract entry for ``key``."""
    for row in cast(Sequence[Mapping[str, object]], ALGORITHM_DEFINITIONS):
        if str(row["key"]) == key.value:
            return row
    message = f"algorithm contract missing for {key.value}"
    raise KeyError(message)


def algorithm_contract(key: Algorithm) -> AlgorithmContract:
    row = algorithm_row(key)
    return AlgorithmContract(
        key=key,
        version=str(row["version"]),
        input_window_days=int(cast(int, row["input_window_days"])),
    )
