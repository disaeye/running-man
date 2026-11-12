"""The active training plan, assembled for the plan page.

The plan page answers one question: "am I executing the plan I think I am?"
So the endpoint returns the plan that is actually in force — the phases that
cover today, the sessions scheduled this week, the load the week is planned
for, and the pace targets the athlete's own paces imply.

Everything here is derived from data that already exists: the phases in
``training_phases``, the sessions in ``training_calendar``, the running distance
planned for the week, and the athlete's own thresholds. The arithmetic lives
in ``plan_state_rules``; this module is the reading and the assembly.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from application.plan.training_paces import (
    goal_training_paces,
    paces_for_date,
    training_pace_history,
)
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool, open_pool
from infrastructure.repositories.goal_milestone_repo import GoalMilestoneRepo
from infrastructure.repositories.goals import GoalsRepo
from infrastructure.repositories.plan_week import (
    WEEK_DAYS,
    week_activities,
    week_loads,
    week_sessions,
)
from presentation.api.plan_state_contracts import (
    ActivePlanResponse,
    PlanPaceTarget,
    PlanPhaseView,
    PlanSessionView,
)
from presentation.api.plan_state_rules import (
    PHASE_LABELS,
    goal_target,
    goal_uuid,
    long_run_day,
    pace_targets,
    phase_total_weeks,
    phase_week_number,
    plan_progress,
    select_goal,
    text_or_none,
    vdot_for,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/active", response_model=ActivePlanResponse)
async def get_active_plan(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    goal_id: Annotated[UUID | None, Query()] = None,
) -> ActivePlanResponse:
    """The plan in force for this athlete right now.

    Without ``goal_id`` the active goal is used: the one whose target date is
    still ahead, and among those the one that closes soonest. A plan that was
    never generated is not an error — the response simply carries no plan, and
    the page asks for one to be created.
    """
    today = today_in_zone(athlete.timezone)
    repo = GoalsRepo()
    goals = await repo.list(athlete.id)
    selected = select_goal(goals, goal_id, today)
    if selected is None:
        return ActivePlanResponse()

    goal_id_value = goal_uuid(selected)
    if goal_id_value is None:
        return ActivePlanResponse()
    phases = await GoalMilestoneRepo().list_training_phases(athlete.id, goal_id_value)

    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=WEEK_DAYS - 1)
    await open_pool()
    async with get_pool().connection() as conn:
        sessions = await week_sessions(conn, athlete.id, week_start, week_end)
        activities = await week_activities(conn, athlete.id, week_start, week_end)
        loads = await week_loads(conn, athlete.id, week_start, week_end)
        history = await training_pace_history(athlete.id, goal_target(selected) or today, conn)

    paces = paces_for_date(history, today)
    if paces is None:
        goal_paces = goal_training_paces(selected)
        paces = goal_paces[0].paces if goal_paces else None

    session_views = [_session_view(row) for row in sessions]
    phase_views = [_phase_view(row, today) for row in phases]
    current = next((phase for phase in phase_views if phase.is_current), None)
    vdot = vdot_for(selected, paces)
    targets = pace_targets(vdot)

    return ActivePlanResponse(
        goal_id=goal_id_value,
        goal_title=text_or_none(selected.get("title")),
        goal_type=text_or_none(selected.get("type")),
        target_date=goal_target(selected),
        race_distance_m=_number(selected.get("race_distance_m")),
        race_target_time_s=_int_or_none(selected.get("race_target_time_s")),
        phases=phase_views,
        current_phase=current,
        week_start=week_start,
        week_end=week_end,
        week_sessions=session_views,
        week_planned_tss=_sum(session_views, "predicted_tss"),
        week_planned_distance_m=_sum(session_views, "predicted_distance_m"),
        week_actual_tss=round(_sum_dict(loads, "value"), 1),
        week_actual_distance_m=round(_sum_dict(activities, "distance_m"), 1),
        phase_week_number=phase_week_number(
            current.start_date if current is not None else None, week_start
        ),
        phase_total_weeks=phase_total_weeks(
            current.start_date if current is not None else None,
            current.end_date if current is not None else None,
        ),
        plan_progress_pct=plan_progress(selected, today),
        vdot=vdot,
        training_paces=[PlanPaceTarget.model_validate(row) for row in targets],
        long_run_day=long_run_day(sessions),
    )


def _phase_view(row: dict[str, object], today: date) -> PlanPhaseView:
    """One phase, with today marked when it falls inside it."""
    name = str(row.get("name") or "")
    start = row.get("start_date")
    end = row.get("end_date")
    start_date = start if isinstance(start, date) else today
    end_date = end if isinstance(end, date) else today
    return PlanPhaseView(
        name=name,
        label=PHASE_LABELS.get(name, name),
        start_date=start_date,
        end_date=end_date,
        target_weekly_tss=_number(row.get("target_weekly_tss")),
        target_weekly_distance_m=_number(row.get("target_weekly_distance_m")),
        is_current=start_date <= today <= end_date,
    )


def _session_view(row: dict[str, object]) -> PlanSessionView:
    """One planned session."""
    session_date = row.get("date")
    return PlanSessionView(
        event_id=str(row.get("event_id")),
        date=session_date if isinstance(session_date, date) else date.min,
        title=str(row.get("title") or ""),
        training_type=text_or_none(row.get("training_type")),
        duration_min=_int_or_none(row.get("duration_min")),
        predicted_tss=_number(row.get("predicted_tss")),
        predicted_distance_m=_number(row.get("predicted_distance_m")),
        pace_min_s_km=_int_or_none(row.get("pace_min_s_km")),
        pace_max_s_km=_int_or_none(row.get("pace_max_s_km")),
        is_completed=bool(row.get("is_completed")),
    )


def _sum(rows: list[PlanSessionView], key: str) -> float | None:
    """One column summed over the sessions."""
    if not rows:
        return None
    total = sum(float(getattr(row, key) or 0.0) for row in rows)
    return round(total, 1)


def _sum_dict(rows: list[dict[str, object]], key: str) -> float:
    """One column summed over plain dicts."""
    total = 0.0
    for row in rows:
        value = _number(row.get(key))
        if value is not None:
            total += value
    return total


def _number(value: object) -> float | None:
    """A numeric field, when it has one."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return None


def _int_or_none(value: object) -> int | None:
    """An integer field, when it has one."""
    number = _number(value)
    return int(number) if number is not None else None
