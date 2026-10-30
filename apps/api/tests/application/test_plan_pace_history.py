from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any, cast
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from application.plan.generator_service import PlanContext, ScheduleOptions, _planned_events
from application.plan.training_paces import (
    TrainingPaceStep,
    paces_for_date,
    training_pace_history,
)
from domain.workout.periodization import generate_phases
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from domain.workout.prescription import EASY


@pytest.mark.no_db
async def test_training_paces_use_historical_threshold_effective_on_session_date() -> None:
    athlete_id = uuid4()
    connection = ThresholdConnection()

    history = await training_pace_history(athlete_id, date(2026, 6, 1), cast(Any, connection))

    assert [step.effective_from for step in history] == [date(2026, 1, 1), date(2026, 3, 1)]
    january = paces_for_date(history, date(2026, 2, 28))
    march = paces_for_date(history, date(2026, 3, 1))
    assert january is not None
    assert march is not None
    assert january != march


class ThresholdConnection:
    def cursor(self) -> "ThresholdCursor":
        return ThresholdCursor()


class ThresholdCursor:
    async def __aenter__(self) -> "ThresholdCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, _query: str, _params: tuple[object, ...]) -> None:
        return None

    async def fetchall(self) -> list[dict[str, object]]:
        return [
            {"effective_from": date(2026, 1, 1), "threshold_pace": 300.0},
            {"effective_from": date(2026, 3, 1), "threshold_pace": 270.0},
        ]


def test_partial_first_week_and_pace_threshold_changes_are_date_specific() -> None:
    today = date(2026, 1, 7)
    race_date = date(2026, 3, 4)
    phases = generate_phases(race_date, baseline_weekly_distance_m=42000, today=today)
    old_paces = {
        "easy": {"min": 350.0, "max": 400.0},
        "threshold": {"min": 280.0, "max": 295.0},
        "interval": {"min": 260.0, "max": 275.0},
    }
    new_paces = {
        "easy": {"min": 310.0, "max": 355.0},
        "threshold": {"min": 260.0, "max": 275.0},
        "interval": {"min": 240.0, "max": 255.0},
    }
    plan_context = PlanContext(
        athlete_id=uuid4(),
        goal_id=uuid4(),
        phases=phases,
        sport="Run",
        timezone=ZoneInfo("UTC"),
        today=today,
        options=ScheduleOptions(1, [5], 120),
        paces=(
            TrainingPaceStep(date(2026, 1, 1), old_paces),
            TrainingPaceStep(date(2026, 2, 1), new_paces),
        ),
        race_date=race_date,
        race_title=None,
        now=datetime(2026, 1, 7, 5, tzinfo=UTC),
    )

    events = cast(list[dict[str, object]], _planned_events(plan_context))

    def preview_date(event: dict[str, object]) -> date:
        preview = cast(dict[str, object], event["preview"])
        return date.fromisoformat(str(preview["date"]))

    first_event_day = min(preview_date(event) for event in events)
    assert first_event_day >= today
    assert all(preview_date(event) < race_date for event in events)
    early = next(
        event
        for event in events
        if preview_date(event) < date(2026, 2, 1) and event["training_type"] == EASY
    )
    later = next(
        event
        for event in events
        if preview_date(event) >= date(2026, 2, 1) and event["training_type"] == EASY
    )
    early_segments = cast(
        list[dict[str, object]], cast(dict[str, object], early["workout_prescription"])["segments"]
    )
    later_segments = cast(
        list[dict[str, object]], cast(dict[str, object], later["workout_prescription"])["segments"]
    )
    assert early_segments[0]["pace_min_s_km"] == 350
    assert later_segments[0]["pace_min_s_km"] == 310
    assert "predicted_tss" not in cast(dict[str, object], early["preview"])
    assert cast(dict[str, object], early["preview"])["predicted_distance_m"] > 0


def test_weekly_plan_honors_six_rest_days_and_session_time_ceiling() -> None:
    try:
        generate_weekly_plan(
            target_weekly_distance_m=10000,
            options=WeekPlanOptions(
                rest_days=6,
                preferred_days_off=[0, 1, 2, 3, 4, 5],
                max_session_duration_min=30,
                training_paces={"easy": {"min": 350, "max": 400}},
            ),
        )
    except ValueError as error:
        assert str(error) == "计划中的单次跑步时长超过运动员设置的上限"
    else:
        raise AssertionError("plan must respect the athlete's session time ceiling")
