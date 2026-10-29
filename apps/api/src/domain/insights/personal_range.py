"""Personal-range position of a metric within the athlete's own history.

The demo pages show a set of ability figures as percentages. A percentage of
what? There is no population reference in this product: no norm tables, no
age-group distribution, no cohort data. The only reference that is real is the
athlete's own recent history.

So a percentage here means: *where does the current value sit inside the
range this athlete's own values have occupied over the window?* The window is
the last 90 days by default.

Two properties make this honest rather than decorative:

* The reference is stated on the face of the number. A reader who does not know
  the rule still sees "相对本人近 90 天区间" next to the bar.
* The position is arithmetic over measured values, not a score. A value below
  the window's minimum reads 0%, above its maximum reads 100%, and a value
  that has no history at all has no position — the field stays absent instead
  of defaulting to 50%.

A metric with fewer than a handful of observations is reported as insufficient:
a range built from two points says nothing about where a third point sits.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isnan
from typing import Final

# A window with fewer observations than this cannot describe a range.
MIN_OBSERVATIONS: Final = 5


@dataclass(frozen=True, slots=True)
class RangePosition:
    """Where one value sits inside the athlete's own range."""

    key: str
    label: str
    unit: str
    value: float | None
    minimum: float | None
    maximum: float | None
    median: float | None
    observations: int
    insufficient: bool

    @property
    def percent(self) -> float | None:
        """The position in the range, 0–100.

        ``None`` when there is no range to be in: too few observations, or no
        current value. A missing position is not 50%.
        """
        if self.insufficient or self.value is None:
            return None
        low = self.minimum
        high = self.maximum
        if low is None or high is None:
            return None
        if high <= low:
            # Every observation is the same value: the current one is at the
            # only position the range has, which is 50%, not 0%.
            return 50.0
        ratio = (self.value - low) / (high - low)
        return round(min(100.0, max(0.0, ratio * 100)), 1)


def range_position(
    key: str,
    label: str,
    unit: str,
    observations: list[float],
    current: float | None,
) -> RangePosition:
    """Where ``current`` sits inside the range of ``observations``."""
    values = [value for value in observations if not isnan(value)]
    count = len(values)
    if count < MIN_OBSERVATIONS:
        return RangePosition(
            key=key,
            label=label,
            unit=unit,
            value=current,
            minimum=None,
            maximum=None,
            median=None,
            observations=count,
            insufficient=True,
        )
    ordered = sorted(values)
    return RangePosition(
        key=key,
        label=label,
        unit=unit,
        value=current,
        minimum=ordered[0],
        maximum=ordered[-1],
        median=_median(ordered),
        observations=count,
        insufficient=False,
    )


def _median(ordered: list[float]) -> float:
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2
