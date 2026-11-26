"""The pure arithmetic behind the plan page.

Everything here is a function of values that were already read: no database,
no clock. Keeping them apart from the endpoint means the rules can be read
without reading the SQL, and the endpoint stays short.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Final
from uuid import UUID

from domain.physiology.vdot import (
    training_paces,
    vdot_from_performance,
    vdot_from_threshold_pace,
)

PHASE_LABELS: Final[dict[str, str]] = {
    "base": "基础储备期",
    "build": "构建期",
    "peak": "峰值期",
    "taper": "减量期",
    "race": "比赛期",
}

PACE_LABELS: Final[dict[str, str]] = {
    "easy": "E 轻松",
    "marathon": "M 马拉松",
    "threshold": "T 乳酸阈",
    "interval": "I 间歇",
    "repetition": "R 冲刺",
}


def select_goal(
    goals: list[dict[str, object]],
    goal_id: UUID | None,
    today: date,
) -> dict[str, object] | None:
    """The goal the page should show.

    The requested goal wins. Otherwise the active primary goal is used, and
    failing that the active goal whose target date is still ahead, closest
    first: a short-term side goal must not displace the athlete's main race.
    """
    if goal_id is not None:
        for goal in goals:
            value = goal.get("goal_id")
            if value == goal_id or value == str(goal_id):
                return goal
        return None
    candidates = [
        goal
        for goal in goals
        if goal.get("status") == "active"
        and goal_target(goal) is not None
        and (goal_target(goal) or date.max) >= today
    ]
    primary = [goal for goal in candidates if goal.get("is_primary")]
    if primary:
        return min(primary, key=lambda goal: goal_target(goal) or date.max)
    if not candidates:
        candidates = [goal for goal in goals if goal.get("status") == "active"]
    if not candidates:
        return None
    return min(candidates, key=lambda goal: goal_target(goal) or date.max)


def goal_uuid(goal: dict[str, object]) -> UUID | None:
    """A goal's id.

    The repository layer turns UUIDs into strings, so the value comes back as
    text and has to be parsed again.
    """
    value = goal.get("goal_id")
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except ValueError:
            return None
    return None


def goal_target(goal: dict[str, object]) -> date | None:
    """A goal's target date, when it has one."""
    return date_or_none(goal.get("target_date"))


def vdot_for(
    goal: dict[str, object],
    paces: dict[str, dict[str, float]] | None,
    *,
    recorded_vdot: float | None = None,
) -> float | None:
    """The athlete's VDOT for the pace table.

    Follows the same priority as the plan generator: recorded threshold pace
    history takes precedence when available, otherwise the goal's race target
    or threshold pace entry gives it.
    """
    if recorded_vdot is not None and recorded_vdot > 0:
        return recorded_vdot
    distance = float_or_none(goal.get("race_distance_m"))
    time_s = goal.get("race_target_time_s")
    if distance is not None and isinstance(time_s, int) and time_s > 0:
        vdot = vdot_from_performance(distance, float(time_s))
        if vdot is not None:
            return vdot
    if paces:
        threshold = paces.get("threshold")
        if threshold is not None:
            vdot = vdot_from_threshold_pace(threshold.get("min", 0.0))
            if vdot is not None:
                return vdot
    return None


def pace_targets(vdot: float | None) -> list[dict[str, object]]:
    """The five training pace ranges for this athlete."""
    if vdot is None:
        return []
    rows: list[dict[str, object]] = []
    for key, row in training_paces(vdot).items():
        if key not in PACE_LABELS:
            continue
        rows.append(
            {
                "key": key,
                "label": PACE_LABELS[key],
                "min_s_per_km": int(row["min"]),
                "max_s_per_km": int(row["max"]),
            }
        )
    return rows


def phase_week_number(phase_start: date | None, week_start: date) -> int | None:
    """Which week of the phase this week is."""
    if phase_start is None:
        return None
    offset = (week_start - phase_start).days // 7
    return max(offset + 1, 1)


def phase_total_weeks(phase_start: date | None, phase_end: date | None) -> int | None:
    """How many weeks the phase lasts."""
    if phase_start is None or phase_end is None:
        return None
    span = (phase_end - phase_start).days + 1
    return max(round(span / 7), 1)


def plan_progress(goal: dict[str, object], today: date) -> float | None:
    """How far through the plan the athlete is, as a percentage."""
    start = goal.get("created_at")
    target = goal.get("target_date")
    if not isinstance(target, date) or not isinstance(start, datetime):
        return None
    total = (target - start.date()).days
    if total <= 0:
        return None
    done = (today - start.date()).days
    return round(min(100.0, max(0.0, done / total * 100)), 1)


def long_run_day(sessions: list[dict[str, object]]) -> int | None:
    """The weekday the long run falls on.

    The long run is the session with the biggest planned distance in the week;
    without a plan there is no long run to point at.
    """
    with_distance = [row for row in sessions if float_or_none(row.get("predicted_distance_m"))]
    if not with_distance:
        return None
    longest = max(
        with_distance,
        key=lambda row: float_or_none(row.get("predicted_distance_m")) or 0.0,
    )
    day = longest.get("date")
    if not isinstance(day, date):
        return None
    return day.weekday()


def date_or_none(value: object) -> date | None:
    """A date field, when it has one."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def float_or_none(value: object) -> float | None:
    """A numeric field, when it has one."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return None


def text_or_none(value: object) -> str | None:
    """A text field, when it has one."""
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None
