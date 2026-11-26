from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast

from domain.insights.session_quality import QualityMatches, empty_quality_matches, quality_matches
from domain.time import local_day


@dataclass(frozen=True, slots=True)
class PlannedActualMatch:
    planned_event_id: str
    planned_date: date
    planned_sport: str | None
    planned_tss: float | None
    actual_activity_id: str | None
    actual_tss: float | None
    match_status: str  # "completed" | "partial" | "missed" | "extra"
    matches: QualityMatches | None = None


def match_planned_actual(
    planned: list[dict[str, object]],
    actuals: list[dict[str, object]],
    tss_tolerance: float = 0.2,
    classifications: Sequence[Mapping[str, object]] | None = None,
    timezone: str | None = None,
) -> list[PlannedActualMatch]:
    """
    Match planned training_calendar events to actual activity_summary activities.

    - Match by date (±1 day) + sport type
    - completed: planned has matching actual, tss within tolerance (80-120%)
    - partial: matching actual but tss outside tolerance
    - missed: no matching actual
    - extra: actual with no matching planned
    """
    matches: list[PlannedActualMatch] = []
    matched_actual_ids: set[str] = set()
    by_activity = {str(row.get("activity_id")): row for row in classifications or []}

    for plan in planned:
        plan_date = _as_date(plan["start_time"], timezone)
        plan_sport = str(plan.get("sport_type") or "")
        plan_tss = plan.get("predicted_tss")
        plan_tss_val = _as_float(plan_tss) if plan_tss is not None else None

        best_actual = _find_actual(
            plan, plan_date, plan_sport, actuals, matched_actual_ids, timezone
        )

        if best_actual is not None:
            actual_id = str(best_actual["activity_id"])
            matched_actual_ids.add(actual_id)
            act_tss_val = _as_float(best_actual.get("tss") or 0)
            if plan_tss_val is not None and plan_tss_val > 0:
                ratio = act_tss_val / plan_tss_val
                if abs(1.0 - ratio) <= tss_tolerance:
                    status = "completed"
                else:
                    status = "partial"
            else:
                status = "completed"
            stored = by_activity.get(actual_id)
            matches.append(
                PlannedActualMatch(
                    planned_event_id=str(plan["event_id"]),
                    planned_date=plan_date,
                    planned_sport=plan_sport or None,
                    planned_tss=plan_tss_val,
                    actual_activity_id=actual_id,
                    actual_tss=act_tss_val,
                    match_status=status,
                    matches=(
                        quality_matches([stored]) if stored is not None else empty_quality_matches()
                    ),
                )
            )
        else:
            matches.append(
                PlannedActualMatch(
                    planned_event_id=str(plan["event_id"]),
                    planned_date=plan_date,
                    planned_sport=plan_sport or None,
                    planned_tss=plan_tss_val,
                    actual_activity_id=None,
                    actual_tss=None,
                    match_status="missed",
                )
            )

    # Extra: actuals not matched to any planned event
    for act in actuals:
        act_id = str(act["activity_id"])
        if act_id not in matched_actual_ids:
            matches.append(
                PlannedActualMatch(
                    planned_event_id="",
                    planned_date=_as_date(act["start_time"], timezone),
                    planned_sport=None,
                    planned_tss=None,
                    actual_activity_id=act_id,
                    actual_tss=_as_float(act.get("tss") or 0),
                    match_status="extra",
                )
            )

    return matches


def _find_actual(
    plan: dict[str, object],
    plan_date: date,
    plan_sport: str,
    actuals: list[dict[str, object]],
    matched_actual_ids: set[str],
    timezone: str | None = None,
) -> dict[str, object] | None:
    """A stored link wins; otherwise match by date and sport."""
    linked_id = str(plan.get("linked_activity_id") or "")
    if linked_id:
        found = next(
            (
                act
                for act in actuals
                if str(act["activity_id"]) == linked_id
                and str(act["activity_id"]) not in matched_actual_ids
            ),
            None,
        )
        if found is not None:
            return found
    for act in actuals:
        act_id = str(act["activity_id"])
        if act_id in matched_actual_ids:
            continue
        act_date = _as_date(act["start_time"], timezone)
        act_sport = str(act.get("sport") or "")
        date_diff = abs((plan_date - act_date).days)
        if date_diff <= 1 and _sport_matches(plan_sport, act_sport):
            return act
    return None


def _as_date(value: object, timezone: str | None = None) -> date:
    if isinstance(value, datetime):
        if value.tzinfo is not None and timezone is not None:
            return local_day(value, timezone)
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValueError(f"Cannot convert {type(value)} to date: {value}")


def _as_float(value: object) -> float:
    return float(cast(Any, value))


def _sport_matches(planned_sport: str, actual_sport: str) -> bool:
    """Match sports with tolerance for variants."""
    if not planned_sport or not actual_sport:
        return True  # match if either is unspecified
    planned_l = planned_sport.lower()
    actual_l = actual_sport.lower()
    if planned_l == actual_l:
        return True
    # Run variants
    if planned_l in ("run", "trailrun", "virtualrun") and actual_l in (
        "run",
        "trailrun",
        "virtualrun",
    ):
        return True
    if planned_l in ("ride", "virtualride") and actual_l in ("ride", "virtualride"):
        return True
    return False
