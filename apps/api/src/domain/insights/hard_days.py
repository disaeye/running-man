from collections.abc import Sequence
from typing import Final

# A day counts as hard when its TSS is well above the athlete's own chronic
# load. An absolute threshold is not portable: 100 TSS is an ordinary Tuesday
# for an athlete at CTL 100 and impossible for one at CTL 25, so the same rule
# marked every session hard for the first and none for the second.
DEFAULT_HARD_MULTIPLIER: Final = 1.5

# Floor for athletes with almost no history, so a 20 TSS jog does not qualify as
# a hard day just because their CTL is 8.
MIN_HARD_TSS: Final = 60.0


def detect_consecutive_hard_days(
    daily_tss: Sequence[float],
    daily_ctl: Sequence[float] | None = None,
    *,
    threshold: float | None = None,
    multiplier: float = DEFAULT_HARD_MULTIPLIER,
) -> list[tuple[int, int]]:
    """Find 2+ day runs of hard days.

    A day is hard when ``tss`` reaches ``max(ctl * multiplier, MIN_HARD_TSS)``.
    ``threshold`` forces a fixed limit, which the tests and the taper helpers
    use; ``daily_ctl`` is the per-day chronic load from the PMC series.
    """
    limits = _hard_limits(daily_tss, daily_ctl, threshold, multiplier)
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, tss in enumerate(daily_tss):
        if tss > limits[index]:
            if start is None:
                start = index
            continue
        if start is not None and index - start >= 2:
            runs.append((start, index - 1))
        start = None
    if start is not None and len(daily_tss) - start >= 2:
        runs.append((start, len(daily_tss) - 1))
    return runs


def _hard_limits(
    daily_tss: Sequence[float],
    daily_ctl: Sequence[float] | None,
    threshold: float | None,
    multiplier: float,
) -> list[float]:
    if threshold is not None:
        return [threshold] * len(daily_tss)
    if daily_ctl is None or len(daily_ctl) < len(daily_tss):
        return [MIN_HARD_TSS] * len(daily_tss)
    return [max(ctl * multiplier, MIN_HARD_TSS) for ctl in daily_ctl]
