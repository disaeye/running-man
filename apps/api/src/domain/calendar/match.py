from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast


@dataclass(frozen=True, slots=True)
class PlannedActualMatch:
    planned_event_id: str
    planned_date: date
    planned_sport: str | None
    planned_tss: float | None
    actual_activity_id: str | None
    actual_tss: float | None
    match_status: str  # "completed" | "partial" | "missed" | "extra"


def match_planned_actual(
    planned: list[dict[str, object]],
    actuals: list[dict[str, object]],
    tss_tolerance: float = 0.2,
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

    for plan in planned:
        plan_date = _as_date(plan["start_time"])
        plan_sport = str(plan.get("sport_type") or "")
        plan_tss = plan.get("predicted_tss")
        plan_tss_val = _as_float(plan_tss) if plan_tss is not None else None

        best_actual = None
        for act in actuals:
            act_id = str(act["activity_id"])
            if act_id in matched_actual_ids:
                continue
            act_date = _as_date(act["start_time"])
            act_sport = str(act.get("sport") or "")
            date_diff = abs((plan_date - act_date).days)
            if date_diff <= 1 and _sport_matches(plan_sport, act_sport):
                best_actual = act
                break

        if best_actual is not None:
            matched_actual_ids.add(str(best_actual["activity_id"]))
            act_tss_val = _as_float(best_actual.get("tss") or 0)
            if plan_tss_val is not None and plan_tss_val > 0:
                ratio = act_tss_val / plan_tss_val
                if abs(1.0 - ratio) <= tss_tolerance:
                    status = "completed"
                else:
                    status = "partial"
            else:
                status = "completed"
            matches.append(
                PlannedActualMatch(
                    planned_event_id=str(plan["event_id"]),
                    planned_date=plan_date,
                    planned_sport=plan_sport or None,
                    planned_tss=plan_tss_val,
                    actual_activity_id=str(best_actual["activity_id"]),
                    actual_tss=act_tss_val,
                    match_status=status,
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
                    planned_date=_as_date(act["start_time"]),
                    planned_sport=None,
                    planned_tss=None,
                    actual_activity_id=act_id,
                    actual_tss=_as_float(act.get("tss") or 0),
                    match_status="extra",
                )
            )

    return matches


def _as_date(value: object) -> date:
    if isinstance(value, datetime):
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
