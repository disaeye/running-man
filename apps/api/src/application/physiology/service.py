from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from application.physiology.algorithm_contract import algorithm_contract, physiology_window_days
from application.physiology.facts import (
    ComputationWindow,
    PhysiologyResults,
    persist_physiology_facts,
)
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric
from domain.physiology.hrmax import estimate_hrmax
from domain.physiology.lthr import estimate_lthr
from domain.physiology.threshold_pace import (
    estimate_threshold_pace,
    extract_efforts_from_activities,
)
from domain.physiology.vdot import vdot_from_efforts
from infrastructure.repositories.physiology import PhysiologyRepo

_CACHE_FRESHNESS = timedelta(days=7)

# Three or more race efforts → high-confidence VDOT estimate.
MIN_VDOT_EFFORTS = 3


@dataclass(frozen=True, slots=True)
class CachedPhysiology:
    hr_max: int | None
    lthr: int | None
    threshold_pace: float | None
    algorithm_version: str
    computation_run_id: UUID | None


@dataclass(frozen=True, slots=True)
class PhysiologyCalculation:
    hr_max: Mapping[str, object]
    lthr: Mapping[str, object]
    threshold_pace: Mapping[str, object]
    vdot: Mapping[str, object] | None = None


async def cached_physiology(
    athlete_id: UUID, now: datetime | None = None
) -> CachedPhysiology | None:
    row = await PhysiologyRepo().cached(athlete_id)
    if row is None:
        return None
    updated_at = row.get("physiology_updated_at")
    algorithm_version = row.get("physiology_algorithm_version")
    current_time = now or datetime.now(UTC)
    if (
        not isinstance(updated_at, datetime)
        or not isinstance(algorithm_version, str)
        or algorithm_version != algorithm_contract(Algorithm.PHYSIOLOGY).version
        or current_time - updated_at > _CACHE_FRESHNESS
    ):
        return None
    return CachedPhysiology(
        hr_max=_integer(row.get("hr_max")),
        lthr=_integer(row.get("lthr")),
        threshold_pace=_number(row.get("threshold_pace")),
        algorithm_version=algorithm_version,
        computation_run_id=_uuid(row.get("physiology_computation_run_id")),
    )


async def calculate_physiology(
    athlete_id: UUID, now: datetime | None = None
) -> PhysiologyCalculation:
    calculated_at = now or datetime.now(UTC)
    hr_window = _window(calculated_at, physiology_window_days(Metric.HR_MAX))
    pace_window = _window(calculated_at, physiology_window_days(Metric.THRESHOLD_PACE))
    lthr_window = _window(calculated_at, physiology_window_days(Metric.LTHR))
    repository = PhysiologyRepo()
    hr_activities = await repository.activities(athlete_id, hr_window.start, hr_window.end)
    pace_activities = await repository.activities(athlete_id, pace_window.start, pace_window.end)
    hr_streams = await repository.heart_rate_window(athlete_id, lthr_window.start, lthr_window.end)
    session_max_hrs = [
        value for item in hr_activities if (value := _number(item.get("max_hr"))) is not None
    ]
    best_20 = [
        value for item in hr_streams if (value := _number(item.get("best_20min_hr"))) is not None
    ]
    best_60 = [
        value for item in hr_streams if (value := _number(item.get("best_60min_hr"))) is not None
    ]
    hr_result = estimate_hrmax(session_max_hrs)
    lthr_result = estimate_lthr(best_20, best_60)
    # Pass the HR references into the effort filter: without them it can only
    # judge a run "hard" by comparing it to the athlete's other runs, which
    # fails when *every* run is easy — the least slow one would be treated as a
    # maximal effort. LTHR is computed just above, so it is available here.
    efforts = extract_efforts_from_activities(
        pace_activities,
        sport_filter="Run",
        hr_max=_integer(hr_result.get("hr_max")),
        lthr=_integer(lthr_result.get("lthr")),
    )
    threshold_pace_result = estimate_threshold_pace(efforts)
    effort_tuples = [(effort.distance_m, effort.duration_s) for effort in efforts]
    vdot_value = vdot_from_efforts(effort_tuples)
    vdot_result = (
        {
            "vdot": vdot_value,
            "method": "daniels_vdot",
            "confidence": "high" if len(effort_tuples) >= MIN_VDOT_EFFORTS else "medium",
        }
        if vdot_value is not None
        else None
    )
    await persist_physiology_facts(
        athlete_id,
        PhysiologyResults(
            hr_max=hr_result,
            lthr=lthr_result,
            threshold_pace=threshold_pace_result,
            vdot=vdot_result,
        ),
        {
            "hr_max": session_max_hrs,
            "lthr_20": best_20,
            "lthr_60": best_60,
            "threshold_efforts": effort_tuples,
            "vdot": vdot_value,
        },
        ComputationWindow(start=hr_window.start, end=calculated_at),
    )
    return PhysiologyCalculation(
        hr_max=hr_result,
        lthr=lthr_result,
        threshold_pace=threshold_pace_result,
        vdot=vdot_result,
    )


def _window(now: datetime, days: int) -> ComputationWindow:
    return ComputationWindow(start=now - timedelta(days=days), end=now)


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) else None


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _uuid(value: object) -> UUID | None:
    return value if isinstance(value, UUID) else None
