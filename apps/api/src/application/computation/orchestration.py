"""Recompute activity load, PMC and physiology facts for one athlete."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from application.computation.runs import ComputationRunResult
from application.load.pmc_facts import recompute_pmc_facts
from application.load.recompute import recompute_activity_load_facts
from application.physiology.service import calculate_physiology
from application.run_classification.service import recompute_session_classifications
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from infrastructure.db.pool import get_pool, open_pool
from infrastructure.repositories.recompute_jobs import RecomputeJobRepo

_PHYSIOLOGY_FRESHNESS = timedelta(days=7)


@dataclass(frozen=True, slots=True)
class StalenessChecks:
    physiology_stale: bool


@dataclass(frozen=True, slots=True)
class RecomputeChainResult:
    activity_load: ComputationRunResult
    pmc: ComputationRunResult
    staleness: StalenessChecks


async def enqueue_activity_recompute(athlete_id: UUID, trigger: str = "manual") -> int:
    return await RecomputeJobRepo().enqueue(athlete_id, trigger)


async def recompute_after_activity_change(
    athlete_id: UUID, trigger: str = "manual"
) -> RecomputeChainResult:
    """Bring every derived number back in line with the imported activities.

    Physiology comes first: thresholds are an input to load, so scoring the new
    activities before re-estimating them would recompute every session against
    yesterday's thresholds and then throw that work away. ``recompute_load=False``
    stops the estimator from rescoring inside this call, because the two steps
    below do exactly that once, after the thresholds are final.
    """
    _ = await calculate_physiology(athlete_id, recompute_load=False)
    activity = await recompute_activity_load_facts(athlete_id, trigger)
    await _prune_orphaned_activity_facts(athlete_id)
    pmc = await recompute_pmc_facts(athlete_id, trigger)
    await _prune_activity_facts_without_history(athlete_id)
    await _recompute_classifications(athlete_id)
    staleness = await check_athlete_computation_staleness(athlete_id)
    return RecomputeChainResult(activity, pmc, staleness)


async def _recompute_classifications(athlete_id: UUID) -> None:
    await open_pool()
    async with get_pool().connection() as conn:
        await recompute_session_classifications(conn, athlete_id)
        await conn.commit()


async def _prune_orphaned_activity_facts(athlete_id: UUID) -> None:
    await open_pool()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            "DELETE FROM derived_metric_facts AS fact "
            "WHERE fact.athlete_id = %s AND fact.subject_type = 'activity' "
            "AND NOT EXISTS (SELECT 1 FROM activity_compute AS activity "
            "WHERE activity.athlete_id = fact.athlete_id "
            "AND activity.activity_id = fact.subject_key)",
            (athlete_id,),
        )
        await conn.commit()


async def _prune_activity_facts_without_history(athlete_id: UUID) -> None:
    await open_pool()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            "DELETE FROM derived_metric_facts AS fact "
            "WHERE fact.athlete_id = %s AND fact.subject_type = 'day' "
            "AND fact.metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr') "
            "AND NOT EXISTS (SELECT 1 FROM activity_compute AS activity "
            "WHERE activity.athlete_id = fact.athlete_id)",
            (athlete_id,),
        )
        await conn.commit()


async def check_athlete_computation_staleness(athlete_id: UUID) -> StalenessChecks:
    await open_pool()
    async with get_pool().connection() as conn:
        physiology_stale = await _physiology_stale(conn, athlete_id)
    return StalenessChecks(physiology_stale=physiology_stale)


async def _physiology_stale(conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID) -> bool:
    query = """
    SELECT physiology_updated_at, physiology_algorithm_version
    FROM athletes
    WHERE id = %s
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        row = await cur.fetchone()
    if row is None or row["physiology_updated_at"] is None:
        return True
    version = row["physiology_algorithm_version"]
    if version != algorithm_contract(Algorithm.PHYSIOLOGY).version:
        return True
    updated_at = row["physiology_updated_at"]
    if not isinstance(updated_at, datetime):
        return True
    return datetime.now(UTC) - updated_at > _PHYSIOLOGY_FRESHNESS
