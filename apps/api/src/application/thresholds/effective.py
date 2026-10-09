"""Effective threshold resolution, shared by every reader.

An athlete may not have recorded a given threshold, but the app can often
derive one: an age yields an estimated HRmax, a wellness upload carries a
resting heart rate, an activity stream carries an observed maximum. Deriving
these independently in each endpoint is how ``/athletes/me`` and
``/insights/zones`` ended up reporting two different HRmax values for the same
athlete (an observed maximum in one, an age prediction in the other).

This module is the single place effective values are computed, and it is
explicit about the difference between the two:

* ``source="recorded"`` — the athlete entered it, or it came from a dated
  threshold step. Trustworthy, safe to compute load from.
* ``source="derived"`` — inferred from age or observed data. Presentable, but
  must be labelled: an age-predicted HRmax carries a residual SD of 7-11 bpm
  (Tanaka et al. 2001), and an observed maximum is a lower bound on the true
  HRmax, not the value itself.

Callers that would change *historical* load must use ``recorded`` values only,
because a derived value has no effective date.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID

from domain.insights.zone_schemes import estimate_hr_max
from domain.thresholds.resolver import (
    ThresholdField,
    ThresholdStep,
    age_from_dob,
    resolve_all,
)
from infrastructure.repositories.athlete_profiles import AthleteProfileRepo
from infrastructure.repositories.thresholds import ThresholdRepo

ThresholdSource = Literal["recorded", "age_estimate", "observed_max", "wellness"]


@dataclass(frozen=True, slots=True)
class EffectiveThreshold:
    """A threshold value plus where it came from."""

    value: int | float | None
    source: ThresholdSource | None

    @property
    def is_estimated(self) -> bool:
        return self.source in {"age_estimate", "observed_max", "wellness"}

    @property
    def recorded(self) -> int | float | None:
        """The value only if the athlete recorded it (``None`` otherwise)."""
        return self.value if self.source == "recorded" else None


@dataclass(frozen=True, slots=True)
class EffectiveThresholds:
    hr_max: EffectiveThreshold
    resting_hr: EffectiveThreshold
    lthr: EffectiveThreshold
    threshold_pace: EffectiveThreshold


async def resolve_effective_thresholds(
    athlete_id: UUID, target_date: date | None = None
) -> EffectiveThresholds:
    """Current thresholds, filling each gap from the best available evidence."""
    history = await ThresholdRepo().history(athlete_id)
    recorded = resolve_all(history, target_date)
    fallbacks = await _fallbacks(athlete_id, target_date)
    return EffectiveThresholds(
        hr_max=_effective(recorded["hr_max"], fallbacks.get("hr_max")),
        resting_hr=_effective(recorded["resting_hr"], fallbacks.get("resting_hr")),
        lthr=_effective(recorded["lthr"], None),
        threshold_pace=_effective(recorded["threshold_pace"], None),
    )


def _effective(
    recorded: int | float | None,
    fallback: tuple[int | float, ThresholdSource] | None,
) -> EffectiveThreshold:
    if recorded is not None:
        return EffectiveThreshold(value=recorded, source="recorded")
    if fallback is not None:
        return EffectiveThreshold(value=fallback[0], source=fallback[1])
    return EffectiveThreshold(value=None, source=None)


async def _fallbacks(
    athlete_id: UUID, target_date: date | None
) -> dict[str, tuple[int | float, ThresholdSource]]:
    """Derived values for thresholds the athlete has not recorded."""
    out: dict[str, tuple[int | float, ThresholdSource]] = {}
    row, wellness, activity_hr = await AthleteProfileRepo().get_me(athlete_id)

    dob = row.get("dob") if row else None
    if isinstance(dob, date):
        age = age_from_dob(dob, target_date or date.today())
        predicted = estimate_hr_max(age)
        if predicted is not None:
            out["hr_max"] = (predicted, "age_estimate")

    resting = (wellness or {}).get("resting_hr")
    if isinstance(resting, int) and resting > 0:
        out["resting_hr"] = (resting, "wellness")

    # An observed maximum is a genuine measurement, but it is a floor on the
    # true HRmax, so it should only win when nothing better exists.
    observed = (activity_hr or {}).get("hr_max")
    if isinstance(observed, int) and observed > 0:
        existing = out.get("hr_max")
        if existing is None:
            out["hr_max"] = (observed, "observed_max")
    return out


def recorded_only(
    history: list[ThresholdStep], target_date: date | None
) -> dict[ThresholdField, int | float | None]:
    """Thresholds with no derived fallback — the safe input for load history.

    Recomputing a past activity must not depend on today's age estimate, so
    callers that write historical facts use this instead of
    :func:`resolve_effective_thresholds`.
    """
    return resolve_all(history, target_date)
