"""Which day's wellness observation applies to a given training day.

Wellness is uploaded overnight: on the morning of the 12th, the newest complete
observation is usually the 11th's. Matching ``target_day`` exactly therefore
found nothing most mornings, and readiness reported "数据不足" for every factor
even when the athlete had slept, worn a heart-rate strap, and synced — the
score sat at the neutral 50 and the app looked like it had no data at all.

The rule implemented here is the one a coach would use: for readiness on day D,
take the most recent observation at or before D, and fall back to a small
window of earlier days for the baseline. Two constraints matter:

* Never look forward. Yesterday's numbers cannot describe tomorrow, and a future
  row (some sources write ahead) must not be treated as today's.
* Do not reach arbitrarily far back. A stale observation describes the athlete
  as they were, so it is capped: beyond that the honest answer is "unknown",
  which the caller renders as not-assessed rather than as a mid-range score.
"""

from __future__ import annotations

from datetime import date, timedelta

# How old an observation may be and still describe the target day. One day
# covers the normal overnight-upload delay; two covers a missed sync without
# pretending a week-old measurement is current. Beyond this, readiness is
# reported as not assessed.
MAX_OBSERVATION_AGE_DAYS = 2

# Days of history used to build a personal baseline (7-day averages).
BASELINE_WINDOW_DAYS = 8


def observation_day(
    target_day: date,
    observed: tuple[date, ...],
    *,
    max_age_days: int = MAX_OBSERVATION_AGE_DAYS,
) -> date | None:
    """Most recent observation date at or before ``target_day``, within the cap.

    Returns ``None`` when nothing usable exists, which callers must treat as
    "not assessed" rather than substituting a default.

    ``observed`` must contain only days that actually carry measurements. A row
    is created for the target day as soon as any wellness field arrives (some
    sources write the date first and fill fields later), so an all-null row for
    today is common — and preferring it over yesterday's complete data would
    report "unknown" every morning despite having the numbers.
    """
    cutoff = target_day - timedelta(days=max_age_days)
    candidates = [day for day in observed if cutoff <= day <= target_day]
    return max(candidates) if candidates else None


def is_usable_for(
    observed_day: date,
    target_day: date,
    *,
    max_age_days: int = MAX_OBSERVATION_AGE_DAYS,
) -> bool:
    """Whether an observation dated ``observed_day`` describes ``target_day``."""
    age = (target_day - observed_day).days
    return 0 <= age <= max_age_days


def baseline_days(
    target_day: date,
    observed: tuple[date, ...],
    *,
    window_days: int = BASELINE_WINDOW_DAYS,
) -> list[date]:
    """Observation dates to average for a baseline, excluding the target itself.

    Restricted to the window before ``target_day`` so that a baseline never
    includes the value being compared against it.
    """
    start = target_day - timedelta(days=window_days)
    return sorted(day for day in observed if start <= day < target_day)
