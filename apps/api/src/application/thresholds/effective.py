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

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.insights.zone_schemes import estimate_hr_max
from domain.thresholds.resolver import (
    ThresholdField,
    ThresholdStep,
    age_from_dob,
    resolve_all,
)
from domain.time import today_in_zone
from infrastructure.db.pool import get_pool
from infrastructure.repositories.athlete_profiles import AthleteProfileRepo
from infrastructure.repositories.thresholds import ThresholdRepo

ThresholdSource = Literal["recorded", "age_estimate", "observed_max", "wellness"]
ProfileConnection = AsyncConnection[DictRow]


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


@dataclass(frozen=True, slots=True)
class ThresholdInputs:
    """One request's reads, shared by ``/athletes/me`` and the resolver."""

    profile: dict[str, object] | None
    history: list[ThresholdStep]
    wellness: dict[str, object] | None
    activity_hr: dict[str, object] | None


async def load_threshold_inputs(
    athlete_id: UUID,
    target_date: date | None = None,
    *,
    include_weight_fallback: bool = False,
) -> ThresholdInputs:
    """Read the profile and history once, then only the fallbacks still needed.

    ``include_weight_fallback`` is for ``/athletes/me``: it also offers the
    latest measured weight when the athlete has not set a weight goal.
    """
    repo = AthleteProfileRepo()
    async with get_pool().connection() as conn:
        profile = await repo.get(athlete_id, conn=conn)
        history = await ThresholdRepo().history(athlete_id, conn=conn)
        recorded = resolve_all(history, target_date)
        need_wellness, need_observed_hr = _required_fallbacks(
            profile, recorded, target_date, include_weight_fallback
        )
        wellness, activity_hr = await repo.measured_fallbacks(
            athlete_id,
            wellness=need_wellness,
            observed_hr=need_observed_hr,
            conn=conn,
        )
    return ThresholdInputs(profile, history, wellness, activity_hr)


async def resolve_effective_thresholds(
    athlete_id: UUID, target_date: date | None = None
) -> EffectiveThresholds:
    """Current thresholds, filling each gap from the best available evidence."""
    return effective_from_inputs(await load_threshold_inputs(athlete_id, target_date))


def effective_from_inputs(
    inputs: ThresholdInputs, target_date: date | None = None
) -> EffectiveThresholds:
    """Pure resolution over reads the caller already made."""
    recorded = resolve_all(inputs.history, target_date)
    fallbacks = _fallbacks(inputs, target_date)
    return EffectiveThresholds(
        hr_max=_effective(recorded["hr_max"], fallbacks.get("hr_max")),
        resting_hr=_effective(recorded["resting_hr"], fallbacks.get("resting_hr")),
        lthr=_effective(recorded["lthr"], None),
        threshold_pace=_effective(recorded["threshold_pace"], None),
    )


def _required_fallbacks(
    profile: dict[str, object] | None,
    recorded: dict[ThresholdField, int | float | None],
    target_date: date | None,
    include_weight_fallback: bool,
) -> tuple[bool, bool]:
    """Which measured values can still change the answer.

    A recorded HRmax makes the observed maximum irrelevant; a birth date gives
    an age estimate that outranks it, so the 46-partition activity aggregate is
    only needed when both are absent.
    """
    row = profile or {}
    need_wellness = recorded["resting_hr"] is None or (
        include_weight_fallback and row.get("weight_goal") is None
    )
    need_observed_hr = (
        recorded["hr_max"] is None and _age_estimate(row, target_date) is None
    )
    return need_wellness, need_observed_hr


def _age_estimate(
    row: dict[str, object], target_date: date | None
) -> int | None:
    dob = row.get("dob")
    if not isinstance(dob, date):
        return None
    # Age feeds the HRmax formula, so it is evaluated on the athlete's own
    # calendar day. A birthday that falls overnight UTC would otherwise be
    # a day early or late, which is exactly the boundary where the estimate
    # is worth re-deriving.
    timezone = row.get("timezone")
    age = age_from_dob(
        dob,
        target_date or today_in_zone(timezone if isinstance(timezone, str) else None),
    )
    return estimate_hr_max(age)


def _fallbacks(
    inputs: ThresholdInputs, target_date: date | None
) -> dict[str, tuple[int | float, ThresholdSource]]:
    """Derived values for thresholds the athlete has not recorded."""
    out: dict[str, tuple[int | float, ThresholdSource]] = {}
    predicted = _age_estimate(inputs.profile or {}, target_date)
    if predicted is not None:
        out["hr_max"] = (predicted, "age_estimate")

    resting = (inputs.wellness or {}).get("resting_hr")
    if isinstance(resting, int) and resting > 0:
        out["resting_hr"] = (resting, "wellness")

    # An observed maximum is a genuine measurement, but it is a floor on the
    # true HRmax, so it should only win when nothing better exists.
    observed = (inputs.activity_hr or {}).get("hr_max")
    if isinstance(observed, int) and observed > 0 and "hr_max" not in out:
        out["hr_max"] = (observed, "observed_max")
    return out


def _effective(
    recorded: int | float | None,
    fallback: tuple[int | float, ThresholdSource] | None,
) -> EffectiveThreshold:
    if recorded is not None:
        return EffectiveThreshold(value=recorded, source="recorded")
    if fallback is not None:
        return EffectiveThreshold(value=fallback[0], source=fallback[1])
    return EffectiveThreshold(value=None, source=None)


def recorded_only(
    history: list[ThresholdStep], target_date: date | None
) -> dict[ThresholdField, int | float | None]:
    """Thresholds with no derived fallback — the safe input for load history.

    Recomputing a past activity must not depend on today's age estimate, so
    callers that write historical facts use this instead of
    :func:`resolve_effective_thresholds`.
    """
    return resolve_all(history, target_date)
