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

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import TypedDict

from domain.insights.session_quality import QualityMatches, empty_quality_matches, quality_matches


class AdherenceTrend(TypedDict):
    avg_adherence_pct: float
    on_track_weeks: int
    total_weeks: int
    trend: str
    type_match: float | None
    structure_match: float | None
    domain_match: float | None


@dataclass(frozen=True, slots=True)
class WeeklyAdherence:
    week_start: date
    completed_tss: float
    planned_tss: float
    adherence_pct: float
    sessions_completed: int
    sessions_missed: int
    sessions_extra: int
    matches: QualityMatches | None = None

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
    classifications: Sequence[Mapping[str, object]] | None = None,
) -> WeeklyAdherence:
    """Adherence for one ISO week.

    ``classifications`` are the stored five-object results for the week. When
    supplied, their per-segment quality gives the type, structure and domain
    agreement alongside the TSS ratio, using the same definition as plan
    quality and the weekly trend views.
    """
    adherence = round(completed_tss / planned_tss * 100, 1) if planned_tss > 0 else 0.0
    return WeeklyAdherence(
        week_start=week_start,
        completed_tss=round(completed_tss, 1),
        planned_tss=round(planned_tss, 1),
        adherence_pct=adherence,
        sessions_completed=sessions_completed,
        sessions_missed=sessions_missed,
        sessions_extra=sessions_extra,
        matches=(
            quality_matches(classifications)
            if classifications is not None
            else empty_quality_matches()
        ),
    )


def iso_week_start(day: date) -> date:
    """The Monday of the ISO week containing ``day``."""
    return day - timedelta(days=day.weekday())


def adherence_trend(
    weeks: Sequence[WeeklyAdherence],
) -> AdherenceTrend:
    """Aggregate adherence signal across multiple weeks.

    Returns avg adherence, on-track week count, and a directional label. This
    is what the Today/Plan dashboard shows: 'over the last N weeks, how well am
    I following the plan?'
    """
    if not weeks:
        return _trend(0.0, 0, 0, "no_data", [], [], [])
    with_plan = [w for w in weeks if w.planned_tss > 0]
    if not with_plan:
        return _trend(0.0, 0, len(weeks), "no_plan", [], [], [])
    avg = sum(w.adherence_pct for w in with_plan) / len(with_plan)
    on_track = sum(1 for w in with_plan if w.status == "on_track")
    if avg >= 90:
        trend = "consistent"
    elif avg >= 70:
        trend = "variable"
    else:
        trend = "inconsistent"
    return _trend(
        round(avg, 1),
        on_track,
        len(with_plan),
        trend,
        [week.matches["type_match"] for week in with_plan if week.matches],
        [week.matches["structure_match"] for week in with_plan if week.matches],
        [week.matches["domain_match"] for week in with_plan if week.matches],
    )


def _trend(
    avg: float,
    on_track: int,
    total: int,
    label: str,
    type_values: list[float | None],
    structure_values: list[float | None],
    domain_values: list[float | None],
) -> AdherenceTrend:
    return {
        "avg_adherence_pct": avg,
        "on_track_weeks": on_track,
        "total_weeks": total,
        "trend": label,
        "type_match": _mean(type_values),
        "structure_match": _mean(structure_values),
        "domain_match": _mean(domain_values),
    }


def _mean(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return round(sum(present) / len(present), 3) if present else None
