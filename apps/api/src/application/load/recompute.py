from dataclasses import dataclass
from datetime import date, datetime
from typing import cast
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from application.computation.runs import ComputationRunResult, ComputationRunSpec
from application.computation.service import (
    ComputationExecution,
    PreparedComputation,
    execute_idempotent_computation,
)
from application.load.activity_facts import (
    ALGORITHM_VERSION,
    ActivityLoadInput,
    ActivityMetricFact,
    compute_activity_metric_facts,
    fingerprint_inputs,
)
from application.load.pace_streams import pace_streams
from application.load.pmc_facts import recompute_pmc_facts
from domain.sports import is_running
from domain.thresholds.resolver import (
    ThresholdStep,
    resolve_all,
    threshold_from_row,
)


@dataclass(frozen=True, slots=True)
class ActivityFactRecomputeResult(ComputationRunResult):
    pass


async def recompute_tss(athlete_id: UUID) -> int:
    result = await recompute_activity_load_facts(athlete_id)
    await recompute_pmc_facts(athlete_id)
    return result.rows_affected


async def recompute_activity_load_facts(
    athlete_id: UUID,
    trigger: str = "manual",
) -> ActivityFactRecomputeResult:
    async def prepare(
        conn: psycopg.AsyncConnection[DictRow],
    ) -> PreparedComputation[tuple[ActivityLoadInput, ...]]:
        activities = await _activity_inputs(conn, athlete_id)
        return PreparedComputation(
            spec=ComputationRunSpec(
                athlete_id=athlete_id,
                computation_kind="activity_load",
                algorithm_version=ALGORITHM_VERSION,
                input_fingerprint=fingerprint_inputs(activities),
                trigger=trigger,
            ),
            payload=activities,
        )

    async def write(
        conn: psycopg.AsyncConnection[DictRow],
        run_id: UUID,
        activities: tuple[ActivityLoadInput, ...],
    ) -> int:
        facts = tuple(
            fact for activity in activities for fact in compute_activity_metric_facts(activity)
        )
        await _delete_orphaned_activity_facts(
            conn, athlete_id, {activity.activity_id for activity in activities}
        )
        return await _insert_facts(conn, athlete_id, run_id, facts)

    result = await execute_idempotent_computation(
        ComputationExecution(
            athlete_id=athlete_id,
            computation_kind="activity_load",
            prepare=prepare,
            write=write,
        )
    )
    return _activity_result(result)


async def _delete_orphaned_activity_facts(
    conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID, activity_ids: set[str]
) -> None:
    query = """
    DELETE FROM derived_metric_facts
    WHERE athlete_id = %s AND subject_type = 'activity'
      AND (%s::text[] IS NULL OR subject_key <> ALL(%s))
    """
    ids = sorted(activity_ids) if activity_ids else None
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, ids, ids))


async def _threshold_history(
    conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID
) -> list[ThresholdStep]:
    """All recorded threshold steps, oldest first.

    Resolved per activity date so recomputing history never re-measures a past
    session against a newer threshold.
    """
    query = (
        "SELECT effective_from, hr_max, resting_hr, lthr, threshold_pace "
        "FROM athlete_thresholds WHERE athlete_id = %s ORDER BY effective_from"
    )
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return [threshold_from_row(dict(row)) for row in await cur.fetchall()]


async def _activity_inputs(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
) -> tuple[ActivityLoadInput, ...]:
    rows = await _activity_rows(conn, athlete_id)
    active_activity_ids = {_text(row["activity_id"]) for row in rows}
    pace_streams_by_activity = await pace_streams(conn, athlete_id, active_activity_ids)
    hr_samples = await _metric_samples(conn, athlete_id, "heart_rate", active_activity_ids)
    thresholds = await _threshold_history(conn, athlete_id)
    return tuple(
        _activity_input(
            row,
            hr_samples.get(_text(row["activity_id"]), ()),
            pace_streams_by_activity.get(_text(row["activity_id"])),
            thresholds,
        )
        for row in rows
    )


async def _activity_rows(
    conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID
) -> list[DictRow]:
    query = (
        "SELECT activity.activity_id, activity.start_time, "
        "(activity.start_time AT TIME ZONE athlete.timezone)::date AS local_day, "
        "activity.duration_s, activity.avg_hr, activity.sport "
        "FROM activity_compute AS activity "
        "JOIN athletes AS athlete ON athlete.id = activity.athlete_id "
        "WHERE activity.athlete_id = %s AND activity.duration_s IS NOT NULL "
        "ORDER BY activity.start_time, activity.activity_id"
    )
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return list(await cur.fetchall())


async def _metric_samples(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
    metric_type: str,
    activity_ids: set[str],
) -> dict[str, tuple[float, ...]]:
    if not activity_ids:
        return {}
    query = (
        "SELECT activity_id, value FROM activity_streams "
        "WHERE athlete_id = %s AND metric_type = %s AND activity_id = ANY(%s) "
        "ORDER BY activity_id, sample_time")
    samples: dict[str, list[float]] = {}
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, metric_type, sorted(activity_ids)))
        for row in await cur.fetchall():
            samples.setdefault(_text(row["activity_id"]), []).append(float(row["value"]))
    return {activity_id: tuple(values) for activity_id, values in samples.items()}


def _activity_input(
    row: DictRow,
    hr_samples: tuple[float, ...],
    pace_streams: tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]] | None,
    thresholds: list[ThresholdStep],
) -> ActivityLoadInput:
    start_time = cast(datetime, row["start_time"])
    target_date = cast(date, row["local_day"])
    sport = row["sport"]
    sport_str = _text(sport) if sport is not None else None
    # Pace-based load only applies to running-family sports.
    is_run = is_running(sport_str)
    resolved = resolve_all(thresholds, target_date)
    threshold_pace = resolved["threshold_pace"]
    return ActivityLoadInput(
        activity_id=_text(row["activity_id"]),
        start_time=start_time,
        duration_s=cast(int, row["duration_s"]),
        sport=sport_str,
        avg_hr=cast(int | None, row["avg_hr"]),
        hr_samples=hr_samples,
        lthr=cast(int | None, resolved["lthr"]),
        pace_streams=pace_streams if is_run else None,
        threshold_pace=float(threshold_pace) if is_run and threshold_pace else None,
    )


async def _insert_facts(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
    run_id: UUID,
    facts: tuple[ActivityMetricFact, ...],
) -> int:
    query = (
        "INSERT INTO derived_metric_facts (athlete_id, subject_type, subject_key, metric_key, "
        "unit, value, effective_at, algorithm_version, computation_run_id, method, confidence) "
        "VALUES (%s, 'activity', %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (athlete_id, "
        "subject_type, subject_key, metric_key, effective_at, algorithm_version) DO UPDATE SET "
        "unit = EXCLUDED.unit, value = EXCLUDED.value, computation_run_id = "
        "EXCLUDED.computation_run_id, method = EXCLUDED.method, confidence = "
        "EXCLUDED.confidence, computed_at = now()"
    )
    async with conn.cursor() as cur:
        for fact in facts:
            _ = await cur.execute(
                query,
                (
                    athlete_id, fact.subject_key, fact.metric_key, fact.unit, fact.value,
                    fact.effective_at, ALGORITHM_VERSION, run_id, fact.method, fact.confidence,
                ),
            )
    return len(facts)


def _text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)


def _activity_result(result: ComputationRunResult) -> ActivityFactRecomputeResult:
    return ActivityFactRecomputeResult(
        computation_run_id=result.computation_run_id,
        status=result.status,
        rows_affected=result.rows_affected,
    )
