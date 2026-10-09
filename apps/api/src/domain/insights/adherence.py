"""Plan-adherence: closing the planned-vs-actual training loop.

The platform computes weekly planned-vs-actual TSS on the fly (coach_context),
but never persists it — so there is no 'did I follow my plan over the last 8
weeks?' history. This module makes adherence a first-class weekly fact: for
each ISO week, the ratio of completed TSS to planned TSS, plus session-level
match counts (completed / partial / missed / extra).

This is the decision-loop closure: plan → execute → measure adherence → adjust
the next cycle. Stored as a weekly ``derived_metric_fact`` so trends are queryable.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True, slots=True)
class WeeklyAdherence:
    week_start: date
    completed_tss: float
    planned_tss: float
    adherence_pct: float
    sessions_completed: int
    sessions_missed: int
    sessions_extra: int

    @property
    def status(self) -> str:
        """Adherence band: on_track / under / over / no_plan."""
        if self.planned_tss <= 0:
            return "no_plan"
        if self.adherence_pct >= 110:
            return "over"
        if self.adherence_pct >= 80:
            return "on_track"
        return "under"


def compute_weekly_adherence(
    week_start: date,
    planned_tss: float,
    completed_tss: float,
    *,
    sessions_completed: int = 0,
    sessions_missed: int = 0,
    sessions_extra: int = 0,
) -> WeeklyAdherence:
    """Adherence for one ISO week.

    week_start is the Monday of the week. TSS values are the week's totals.
    """
    adherence = (
        round(completed_tss / planned_tss * 100, 1) if planned_tss > 0 else 0.0
    )
    return WeeklyAdherence(
        week_start=week_start,
        completed_tss=round(completed_tss, 1),
        planned_tss=round(planned_tss, 1),
        adherence_pct=adherence,
        sessions_completed=sessions_completed,
        sessions_missed=sessions_missed,
        sessions_extra=sessions_extra,
    )


def iso_week_start(day: date) -> date:
    """The Monday of the ISO week containing ``day``."""
    return day - timedelta(days=day.weekday())


def adherence_trend(
    weeks: Sequence[WeeklyAdherence],
) -> dict[str, float | str]:
    """Aggregate adherence signal across multiple weeks.

    Returns avg adherence, on-track week count, and a directional label. This
    is what the Today/Plan dashboard shows: 'over the last N weeks, how well am
    I following the plan?'
    """
    if not weeks:
        return {"avg_adherence_pct": 0.0, "on_track_weeks": 0, "total_weeks": 0, "trend": "no_data"}
    with_plan = [w for w in weeks if w.planned_tss > 0]
    if not with_plan:
        return {
            "avg_adherence_pct": 0.0,
            "on_track_weeks": 0,
            "total_weeks": len(weeks),
            "trend": "no_plan",
        }
    avg = sum(w.adherence_pct for w in with_plan) / len(with_plan)
    on_track = sum(1 for w in with_plan if w.status == "on_track")
    if avg >= 90:
        trend = "consistent"
    elif avg >= 70:
        trend = "variable"
    else:
        trend = "inconsistent"
    return {
        "avg_adherence_pct": round(avg, 1),
        "on_track_weeks": on_track,
        "total_weeks": len(with_plan),
        "trend": trend,
    }
