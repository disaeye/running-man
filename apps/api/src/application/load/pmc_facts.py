import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Final, cast
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import DictRow

from application.computation.runs import ComputationRunResult, ComputationRunSpec
from application.computation.service import (
    ComputationExecution,
    PreparedComputation,
    execute_idempotent_computation,
)
from domain.load.pmc import build_pmc_series

ALGORITHM_VERSION: Final = "1.0.0"
COMPUTATION_KIND: Final = "pmc"
PMC_METRIC_UNITS: Final = {
    "daily_tss": "points",
    "ctl": "points",
    "atl": "points",
    "tsb": "points",
    "acwr": "ratio",
}
DAY_BUCKET_VERSION: Final = "tz-aware-day-current-day"


@dataclass(frozen=True, slots=True)
class PmcFactRecomputeResult(ComputationRunResult):
    pass


@dataclass(frozen=True, slots=True)
class PmcMetricFact:
    day: date
    metric_key: str
    unit: str
    value: float


async def recompute_pmc_facts(
    athlete_id: UUID,
    trigger: str = "manual",
) -> PmcFactRecomputeResult:
    async def prepare(
        conn: psycopg.AsyncConnection[DictRow],
    ) -> PreparedComputation[tuple[str, date, dict[date, float]]]:
        athlete_tz = await _athlete_timezone(conn, athlete_id)
        today = datetime.now(ZoneInfo(athlete_tz)).date()
        daily_tss = await _current_daily_tss(conn, athlete_id, athlete_tz, today)
        return PreparedComputation(
            spec=ComputationRunSpec(
                athlete_id=athlete_id,
                computation_kind=COMPUTATION_KIND,
                algorithm_version=ALGORITHM_VERSION,
                input_fingerprint=_fingerprint_daily_tss(daily_tss, athlete_tz, today),
                trigger=trigger,
                input_window_start=(
                    datetime.combine(min(daily_tss), time.min, tzinfo=UTC) if daily_tss else None
                ),
                input_window_end=datetime.combine(today, time.max, tzinfo=UTC),
            ),
            payload=(athlete_tz, today, daily_tss),
        )

    async def write(
        conn: psycopg.AsyncConnection[DictRow],
        run_id: UUID,
        payload: tuple[str, date, dict[date, float]],
    ) -> int:
        _athlete_tz, today, daily_tss = payload
        facts = _pmc_facts_for_daily_tss(daily_tss, today)
        if not facts:
            await _delete_pmc_facts(conn, athlete_id)
            return 0
        await _delete_stale_pmc_facts(conn, athlete_id, min(daily_tss), today)
        return await _insert_pmc_facts(conn, athlete_id, run_id, facts)

    result = await execute_idempotent_computation(
        ComputationExecution(
            athlete_id=athlete_id,
            computation_kind=COMPUTATION_KIND,
            prepare=prepare,
            write=write,
        )
    )
    return _pmc_result(result)


async def _athlete_timezone(conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID) -> str:
    async with conn.cursor() as cur:
        _ = await cur.execute("SELECT timezone FROM athletes WHERE id = %s", (athlete_id,))
        row = await cur.fetchone()
    raw = row["timezone"] if row else None
    timezone = str(raw or "UTC")
    _ = ZoneInfo(timezone)
    return timezone


async def _current_daily_tss(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
    athlete_tz: str,
    today: date,
) -> dict[date, float]:
    query = """
    SELECT (a.start_time AT TIME ZONE %s)::date AS day, COALESCE(SUM(tss.value), 0) AS tss
    FROM activity_compute AS a
    JOIN current_activity_facts AS tss
      ON tss.athlete_id = a.athlete_id
     AND tss.subject_key = a.activity_id
     AND tss.metric_key = 'tss'
    WHERE a.athlete_id = %s AND (a.start_time AT TIME ZONE %s)::date <= %s
    GROUP BY day
    ORDER BY day
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_tz, athlete_id, athlete_tz, today))
        rows = await cur.fetchall()
    return {cast(date, row["day"]): float(row["tss"]) for row in rows}


async def _delete_stale_pmc_facts(
    conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID, first_day: date, today: date
) -> None:
    query = """
    DELETE FROM derived_metric_facts
    WHERE athlete_id = %s AND subject_type = 'day'
      AND metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
      AND subject_key ~ '^\\d{4}-\\d{2}-\\d{2}$'
      AND (subject_key::date < %s OR subject_key::date > %s)
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, first_day, today))


async def _delete_pmc_facts(
    conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID
) -> None:
    query = """
    DELETE FROM derived_metric_facts
    WHERE athlete_id = %s AND subject_type = 'day'
      AND metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
      AND subject_key ~ '^\\d{4}-\\d{2}-\\d{2}$'
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))


def _fingerprint_daily_tss(daily_tss: dict[date, float], athlete_tz: str, today: date) -> str:
    payload = [{"day": day.isoformat(), "tss": daily_tss[day]} for day in sorted(daily_tss)]
    encoded = json.dumps(
        {
            "bucket": DAY_BUCKET_VERSION,
            "tz": athlete_tz,
            "today": today.isoformat(),
            "days": payload,
        },
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(encoded.encode()).hexdigest()


def _pmc_facts_for_daily_tss(
    daily_tss: dict[date, float], today: date | None = None
) -> tuple[PmcMetricFact, ...]:
    if not daily_tss:
        return ()
    first_day = min(daily_tss)
    last_day = max(daily_tss)
    if today is not None and first_day > today:
        return ()
    daily_tss = {day: value for day, value in daily_tss.items() if day <= (today or last_day)}
    if not daily_tss:
        return ()
    series = build_pmc_series(daily_tss, end_day=today)
    facts: list[PmcMetricFact] = []
    for point in series:
        day = cast(date, point["day"])
        facts.extend(
            (
                _fact(day, "daily_tss", _point_float(point, "tss")),
                _fact(day, "ctl", _point_float(point, "ctl")),
                _fact(day, "atl", _point_float(point, "atl")),
                _fact(day, "tsb", _point_float(point, "tsb")),
            )
        )
        acwr = point["acwr"]
        if acwr is not None:
            facts.append(_fact(day, "acwr", cast(float, acwr)))
    return tuple(facts)


def _fact(day: date, metric_key: str, value: float) -> PmcMetricFact:
    return PmcMetricFact(day, metric_key, PMC_METRIC_UNITS[metric_key], float(value))


def _point_float(point: dict[str, date | float | None], key: str) -> float:
    value = point[key]
    assert isinstance(value, float | int), f"{key} missing from PMC point"
    return float(value)


async def _insert_pmc_facts(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
    run_id: UUID,
    facts: tuple[PmcMetricFact, ...],
) -> int:
    query = """
    INSERT INTO derived_metric_facts (
        athlete_id, subject_type, subject_key, metric_key, unit, value,
        effective_at, algorithm_version, computation_run_id, method, confidence
    ) VALUES (%s, 'day', %s, %s, %s, %s, %s, %s, %s, 'pmc_from_activity_tss', 1.0)
    ON CONFLICT (
        athlete_id, subject_type, subject_key, metric_key, effective_at, algorithm_version
    ) DO UPDATE SET
        unit = EXCLUDED.unit,
        value = EXCLUDED.value,
        computation_run_id = EXCLUDED.computation_run_id,
        method = EXCLUDED.method,
        confidence = EXCLUDED.confidence,
        computed_at = now()
    """
    values = [
        (
            athlete_id,
            fact.day.isoformat(),
            fact.metric_key,
            fact.unit,
            fact.value,
            datetime.combine(fact.day, time.min, tzinfo=UTC),
            ALGORITHM_VERSION,
            run_id,
        )
        for fact in facts
    ]
    if not values:
        return 0
    async with conn.cursor() as cur:
        await cur.executemany(query, values)
    return len(values)


def _pmc_result(result: ComputationRunResult) -> PmcFactRecomputeResult:
    return PmcFactRecomputeResult(
        computation_run_id=result.computation_run_id,
        status=result.status,
        rows_affected=result.rows_affected,
    )
