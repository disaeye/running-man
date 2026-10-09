from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from domain.insights.readiness import compute_readiness, compute_recommendation
from infrastructure.repositories.insight_reads import InsightReadRepo
from infrastructure.repositories.pmc import PmcRepo
from infrastructure.repositories.wellness import WellnessRepo


@dataclass(frozen=True, slots=True)
class ReadinessAssessment:
    wellness: list[dict[str, object]]
    loads: list[dict[str, object]]
    readiness: dict[str, object]


async def readiness_inputs(
    athlete_id: UUID, target_day: date
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    start = target_day - timedelta(days=8)
    wellness = await WellnessRepo().readiness_range(athlete_id, start, target_day)
    loads = await PmcRepo().get_daily_load_range(athlete_id, start, target_day)
    return wellness, loads


async def events_for_day(athlete_id: UUID, target_day: date) -> list[dict[str, object]]:
    return await InsightReadRepo().events_for_day(athlete_id, target_day)


async def readiness_assessment(athlete_id: UUID, target_day: date) -> ReadinessAssessment:
    wellness, loads = await readiness_inputs(athlete_id, target_day)
    return ReadinessAssessment(
        wellness=wellness,
        loads=loads,
        readiness=compute_readiness(target_day, wellness, loads),
    )


async def training_recommendation(athlete_id: UUID, target_day: date) -> dict[str, object]:
    wellness, loads = await readiness_inputs(athlete_id, target_day)
    events = await events_for_day(athlete_id, target_day)
    completed, planned, recent_days = await week_context(athlete_id, target_day)
    readiness = compute_readiness(target_day, wellness, loads)
    return compute_recommendation(readiness, events, completed, planned, recent_days)


async def week_context(athlete_id: UUID, target_day: date) -> tuple[float, float, int]:
    start = target_day - timedelta(days=target_day.weekday())
    end = start + timedelta(days=6)
    completed = await PmcRepo().total_tss(athlete_id, start, target_day)
    planned, recent_days = await InsightReadRepo().week_context(athlete_id, start, end, target_day)
    return completed, planned, recent_days
