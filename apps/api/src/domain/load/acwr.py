"""Acute:chronic workload ratio.

The ratio compares recent load (acute, 7 days) against the load the athlete is
adapted to (chronic, 28 days). It is only meaningful once the chronic average
has actually been observed: with fewer than 28 days of history the denominator
is built from a partial window, and with no load at all it is zero.

Both of those cases previously returned ``0.0``, which is indistinguishable from
a real reading of "your load dropped sharply" — the contract assigns ACWR < 0.8
the label "减量风险". A new athlete, or anyone returning from a break, was
therefore shown a significant finding that was purely an artifact of having no
data. The honest answer is ``None``: not enough history to say.

EWMA smoothing means the chronic value converges toward the true level rather
than reaching it, so the requirement is expressed as a minimum number of days of
history rather than a check for non-zero.
"""

from collections.abc import Sequence

from .constants import ACUTE_WINDOW_DAYS, CHRONIC_WINDOW_DAYS

ACUTE_LAMBDA = 2.0 / (ACUTE_WINDOW_DAYS + 1)
CHRONIC_LAMBDA = 2.0 / (CHRONIC_WINDOW_DAYS + 1)

# Days of history required before a ratio is reported. One full chronic window:
# below that the denominator describes a partial window, so the ratio would be
# measuring the EWMA's warm-up rather than the athlete's adaptation.
MIN_HISTORY_DAYS = CHRONIC_WINDOW_DAYS

# The chronic EWMA is seeded from the first observation, so early values are
# dominated by whatever the athlete happened to do that day. Treat the smoothed
# value as unusable below this floor; it also prevents a tiny non-zero chronic
# (a few minutes of walking after a break) from producing a huge ratio.
MIN_CHRONIC_LOAD = 1.0


def _ewma(values: Sequence[float], alpha: float) -> list[float]:
    """Exponentially weighted moving average, seeded with the first sample.

    Seeding from the first sample (rather than zero) keeps the series on the
    athlete's actual scale from day one, so the caller can decide — via
    :data:`MIN_HISTORY_DAYS` — when the value is trustworthy instead of having
    a warm-up ramp baked into the numbers.
    """
    smoothed: list[float] = []
    previous = values[0] if values else 0.0
    for value in values:
        previous = alpha * value + (1.0 - alpha) * previous
        smoothed.append(previous)
    return smoothed


def compute_acwr(daily_loads: Sequence[float]) -> list[float | None]:
    """Rolling ACWR, one entry per input day, or ``None`` where it is unknown.

    ``None`` means "not enough history", which is a different message from any
    numeric value and must be rendered as such.
    """
    if not daily_loads:
        return []

    acute = _ewma(daily_loads, ACUTE_LAMBDA)
    chronic = _ewma(daily_loads, CHRONIC_LAMBDA)

    ratios: list[float | None] = []
    for index in range(len(daily_loads)):
        has_enough_history = index + 1 >= MIN_HISTORY_DAYS
        chronic_load = chronic[index]
        if not has_enough_history or chronic_load < MIN_CHRONIC_LOAD:
            ratios.append(None)
        else:
            ratios.append(acute[index] / chronic_load)
    return ratios
