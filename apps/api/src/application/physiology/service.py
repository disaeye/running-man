from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from application.load.pmc_facts import recompute_pmc_facts
from application.load.recompute import recompute_activity_load_facts
from application.physiology.facts import (
    ComputationWindow,
    PhysiologyResults,
    persist_physiology_facts,
)
from application.physiology.physiology_windows import physiology_window_days
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric
from domain.physiology.hrmax import estimate_hrmax
from domain.physiology.lthr import estimate_lthr
from domain.physiology.threshold_pace import (
    estimate_critical_speed,
    extract_efforts_from_activities,
)
from domain.physiology.vdot import vdot_from_efforts, vdot_to_threshold_pace
from domain.time import DEFAULT_TIMEZONE, today_in_zone
from infrastructure.repositories.physiology import PhysiologyRepo
from infrastructure.repositories.thresholds import ThresholdRepo

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
    repository = PhysiologyRepo()
    # The threshold step is stamped on the athlete's calendar day, matching the
    # manual path. Stamping on the host's date makes an evening reading apply
    # only to the previous day's sessions for an athlete east of Greenwich.
    timezone_name = await repository.timezone(athlete_id)
    today = today_in_zone(timezone_name, calculated_at)
    effective_from = await _threshold_step_date(
        athlete_id, repository, timezone_name, today
    )
    hr_window = _window(calculated_at, physiology_window_days(Metric.HR_MAX))
    pace_window = _window(calculated_at, physiology_window_days(Metric.THRESHOLD_PACE))
    lthr_window = _window(calculated_at, physiology_window_days(Metric.LTHR))
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
    lthr_result = estimate_lthr(best_20, best_60, _integer(hr_result.get("hr_max")))
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
    critical_speed_result = estimate_critical_speed(efforts)
    effort_tuples = [(effort.distance_m, effort.duration_s) for effort in efforts]
    vdot_value = vdot_from_efforts(effort_tuples)
    threshold_pace_result = _threshold_pace_from(
        vdot_value, critical_speed_result, len(effort_tuples)
    )
    vdot_result = (
        {
            "vdot": vdot_value,
            "method": "daniels_vdot",
            "confidence": "high" if len(effort_tuples) >= MIN_VDOT_EFFORTS else "medium",
        }
        if vdot_value is not None
        else None
    )
    written = await persist_physiology_facts(
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
        effective_from=effective_from,
    )
    _ = await ThresholdRepo().backfill_earlier_gaps(athlete_id, today, written)
    _ = await recompute_load_after_threshold_change(athlete_id)
    return PhysiologyCalculation(
        hr_max=hr_result,
        lthr=lthr_result,
        threshold_pace=threshold_pace_result,
        vdot=vdot_result,
    )


async def _threshold_step_date(
    athlete_id: UUID,
    repository: PhysiologyRepo,
    timezone_name: str | None,
    today: date,
) -> date:
    """Where the first estimated step belongs.

    An estimate recorded today only governs sessions from today onward, and
    ``backfill_earlier_gaps`` can only fill rows that already exist. On an empty
    ``athlete_thresholds`` table there is no row to widen, so a first sync
    followed by a first estimate left every earlier activity without a
    threshold — and an activity with no threshold pace and no LTHR produces no
    load at all.

    The first step is therefore anchored on the earliest activity, which covers
    the whole history with one row. Once any step exists, later estimates stay on
    today and the table keeps its time-versioned shape.
    """
    if await ThresholdRepo().earliest(athlete_id) is not None:
        return today
    first_day = await repository.earliest_activity_day(
        athlete_id, timezone_name or DEFAULT_TIMEZONE
    )
    return min(first_day, today) if first_day is not None else today


async def recompute_load_after_threshold_change(athlete_id: UUID) -> int:
    """Rescore activities against the thresholds now in force, then re-derive PMC.

    A threshold is time-versioned, so a new step applies from today and past
    sessions keep the boundaries they were run under. Today's already-computed
    facts, however, were built from the previous step, and leaving them alone
    means the same session carries one load before the re-estimate and another
    after it.

    The PMC series is derived from daily TSS, so it has to be rebuilt in the same
    call. Stopping at the activity facts left CTL/ATL/TSB on the previous load
    until the next day's fingerprint change or an unrelated recompute — and the
    Today page reads the PMC facts, so the athlete saw the old curve next to the
    new numbers.

    Both steps are fingerprint-guarded, so this only writes what changed.
    """
    result = await recompute_activity_load_facts(athlete_id, trigger="threshold_change")
    _ = await recompute_pmc_facts(athlete_id, trigger="threshold_change")
    return result.rows_affected


def _window(now: datetime, days: int) -> ComputationWindow:
    return ComputationWindow(start=now - timedelta(days=days), end=now)


def _threshold_pace_from(
    vdot: float | None, critical_speed: Mapping[str, object], effort_count: int
) -> dict[str, object]:
    """Threshold pace (LT2) from the athlete's best maximal effort.

    Threshold pace is an LT2 quantity. The critical-speed fit answers a
    different question — it is the asymptote of the distance–time boundary, and
    by construction slower than anything the athlete has held. Writing CS into
    `threshold_pace` made the "threshold" slower than the athlete's half-marathon
    pace, and every pace prescription is derived from it.

    Threshold therefore comes from Daniels' VDOT model, which is defined on race
    performances, and CS is carried alongside as a cross-check.

    VDOT answers "how fast could this athlete race", so it needs enough hard
    efforts to describe the athlete rather than one afternoon: a single run's
    VDOT is a performance estimate, not a threshold. Below
    :data:`MIN_VDOT_EFFORTS` the pace is withheld with the count that is missing,
    which the UI turns into "还差几次". The athlete's last valid threshold stays
    in force meanwhile — refusing an estimate is not the same as deleting one.
    """
    cross_check = {
        "critical_speed_s_per_km": critical_speed.get("critical_speed_s_per_km"),
        "critical_speed_ms": critical_speed.get("critical_speed_ms"),
        "effort_count": effort_count,
    }
    pace = vdot_to_threshold_pace(vdot) if vdot is not None else 0.0
    if pace > 0 and effort_count >= MIN_VDOT_EFFORTS:
        return {
            "threshold_pace_s_per_km": round(pace),
            "confidence": critical_speed.get("confidence"),
            "data_sufficient": True,
            "method": "daniels_vdot_threshold",
            **cross_check,
        }
    return {
        "threshold_pace_s_per_km": None,
        "confidence": "low",
        "data_sufficient": False,
        "method": "insufficient_maximal_efforts",
        **cross_check,
    }


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) else None


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _uuid(value: object) -> UUID | None:
    return value if isinstance(value, UUID) else None
