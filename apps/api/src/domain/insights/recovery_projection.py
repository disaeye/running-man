"""When does the training-stress balance come back above zero?

The demo pages want a sentence like "约 4 天后回到正区间". That sentence is
a projection, so it has to be computed by the same model that produces the
PMC series — otherwise the number on the card and the chart next to it would
disagree.

The projection here is the plain rest-only case: from the current CTL and
ATL, with no training planned, how many days until CTL − ATL reaches zero?
With the two decay constants that define the PMC model
(``CTL_DECAY_DAYS`` and ``ATL_DECAY_DAYS``) this has a closed form, so the
answer is exact rather than a sampled curve.

A schedule that loads the athlete changes the answer, so this function is
only the resting projection. The page says so when it shows the number.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from domain.load.constants import ATL_DECAY_DAYS, CTL_DECAY_DAYS

# The projection looks this many days ahead. Beyond that the athlete will
# have trained again, so the number stops meaning anything.
MAX_HORIZON_DAYS: Final = 60

# TSB is considered "back in the positive zone" at or above this value.
RECOVERY_TARGET_TSB: Final = 0.0

# A TSB within this distance of the target counts as reached.
_TOLERANCE: Final = 0.05


@dataclass(frozen=True, slots=True)
class RecoveryProjection:
    """How long until the training-stress balance returns to positive."""

    days: int | None
    current_tsb: float
    projected_tsb: float

    @property
    def reachable(self) -> bool:
        """Whether the balance reaches the target within the horizon.

        A CTL below the ATL can still recover, but only slowly; when even the
        horizon is not enough, the answer is "no date", not a wrong date.
        """
        return self.days is not None


def project_recovery(
    current_ctl: float,
    current_atl: float,
    horizon_days: int = MAX_HORIZON_DAYS,
) -> RecoveryProjection:
    """Days until TSB reaches zero, resting.

    The rest-only projection is the exact solution of the two EWMA recursions
    with a zero input:

        CTL(t) = CTL0 · exp(−t / CTL_DECAY_DAYS)
        ATL(t) = ATL0 · exp(−t / ATL_DECAY_DAYS)

    so TSB(t) is the difference of two exponentials. The day it crosses zero
    is found by scanning the horizon day by day: the curve is smooth and the
    answer is a day count, so a scan at one-day resolution is what the reader
    can use anyway.
    """
    horizon = min(max(horizon_days, 1), MAX_HORIZON_DAYS)
    current_tsb = current_ctl - current_atl
    if current_tsb >= RECOVERY_TARGET_TSB - _TOLERANCE:
        return RecoveryProjection(days=0, current_tsb=current_tsb, projected_tsb=current_tsb)

    ctl = current_ctl
    atl = current_atl
    for day in range(1, horizon + 1):
        ctl += (0.0 - ctl) / CTL_DECAY_DAYS
        atl += (0.0 - atl) / ATL_DECAY_DAYS
        tsb = ctl - atl
        if tsb >= RECOVERY_TARGET_TSB - _TOLERANCE:
            return RecoveryProjection(days=day, current_tsb=current_tsb, projected_tsb=tsb)

    return RecoveryProjection(days=None, current_tsb=current_tsb, projected_tsb=current_tsb)
