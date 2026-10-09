import hashlib
import math
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime, time, timedelta
from typing import cast
from uuid import UUID, uuid4

import psycopg
import pytest

from application.load import pmc_facts
from application.load.pmc_facts import ALGORITHM_VERSION, recompute_pmc_facts
from domain.load.pmc import build_pmc_series
from infrastructure.auth.settings import settings
from infrastructure.db import domain_constraints
from infrastructure.db.pool import close_pool, open_pool
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000014")


def _configure_database_url() -> None:
    settings.database_url = "postgresql://postgres@/test_running_man?host=/var/run/postgresql&port=15434"


@pytest.fixture(scope="session")
async def test_pool() -> AsyncGenerator[None, None]:
    _configure_database_url()
    await close_pool()
    await open_pool()
    try:
        yield
    finally:
        await close_pool()


async def test_pmc_facts_match_full_history_domain_series(
    db_conn: psycopg.Connection, test_pool: None
) -> None:
    _ensure_schema()
    daily_tss = {date(2026, 7, 1): 100.0, date(2026, 7, 3): 50.0}
    _seed_activity_tss(db_conn, daily_tss)

    result = await recompute_pmc_facts(ATHLETE_ID)

    facts = _daily_facts()
    expected_end = max(facts)
    expected = build_pmc_series(daily_tss, end_day=expected_end)
    assert result.status == "success"
    assert result.rows_affected == sum(len(metrics) for metrics in facts.values())
    for actual_day, expected_day in zip(
        _series_from_facts(facts), _series_values(expected), strict=True
    ):
        _assert_series_matches(actual_day, expected_day)


async def test_pmc_series_extends_through_today_and_decays_on_rest_days() -> None:
    first_day = date(2026, 7, 1)
    today = first_day + timedelta(days=7)
    facts = pmc_facts._pmc_facts_for_daily_tss({first_day: 80.0}, today)

    assert [fact.day for fact in facts if fact.metric_key == "daily_tss"] == [
        first_day + timedelta(days=offset) for offset in range(8)
    ]
    assert [fact.value for fact in facts if fact.metric_key == "daily_tss"] == [80.0] + [0.0] * 7
    ctl = [fact.value for fact in facts if fact.metric_key == "ctl"]
    atl = [fact.value for fact in facts if fact.metric_key == "atl"]
    assert ctl[-1] < ctl[0]
    assert atl[-1] < atl[0]


async def test_pmc_fact_recompute_skips_unchanged_inputs(db_conn: psycopg.Connection) -> None:
    _ensure_schema()
    _seed_activity_tss(db_conn, {date(2026, 7, 1): 80.0})

    first = await recompute_pmc_facts(ATHLETE_ID)
    second = await recompute_pmc_facts(ATHLETE_ID)

    assert first.status == "success"
    assert second.status == "skipped"
    assert second.rows_affected == 0
    assert _run_status_counts() == {"skipped": 1, "success": 1}


async def test_mid_run_failure_preserves_previous_current_facts(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ensure_schema()
    _seed_activity_tss(db_conn, {date(2026, 7, 1): 100.0})
    await recompute_pmc_facts(ATHLETE_ID)
    before = _daily_facts()
    _seed_activity_tss(db_conn, {date(2026, 7, 2): 200.0})
    insert_pmc_facts = pmc_facts._insert_pmc_facts

    async def fail_after_partial_insert(
        conn: psycopg.AsyncConnection,
        athlete_id: UUID,
        run_id: UUID,
        facts: tuple[pmc_facts.PmcMetricFact, ...],
    ) -> int:
        await insert_pmc_facts(conn, athlete_id, run_id, facts[:1])
        msg = "simulated insert failure"
        raise psycopg.OperationalError(msg)

    monkeypatch.setattr(pmc_facts, "_insert_pmc_facts", fail_after_partial_insert)

    with pytest.raises(psycopg.OperationalError, match="simulated insert failure"):
        await recompute_pmc_facts(ATHLETE_ID)

    assert _daily_facts() == before
    assert _run_status_counts() == {"failed": 1, "success": 1}


def _ensure_schema() -> None:
    _configure_database_url()
    ensure_activity_fact_schema(ATHLETE_ID)
    with psycopg.connect(settings.database_url) as schema_conn, schema_conn.cursor() as cur:
        for row in domain_constraints.metric_rows():
            cur.execute(
                """
                INSERT INTO metric_definitions (
                    metric_key, unit, display_unit, classification, materialization,
                    null_semantics, legal_min, legal_max, ui_precision
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (metric_key) DO UPDATE SET unit = EXCLUDED.unit
                """,
                (
                    row["key"],
                    row["unit"],
                    row["display_unit"],
                    row["classification"],
                    row["materialization"],
                    row["null_semantics"],
                    row["legal_min"],
                    row["legal_max"],
                    row["ui_precision"],
                ),
            )


def _seed_activity_tss(db_conn: psycopg.Connection, daily_tss: dict[date, float]) -> None:
    with db_conn.cursor() as cur:
        for day, tss in daily_tss.items():
            activity_id = f"activity-{day.isoformat()}"
            effective_at = datetime.combine(day, time(hour=8), tzinfo=UTC)
            cur.execute(
                """
                INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, duration_s)
                VALUES (%s, %s, %s, 'run', 3600)
                ON CONFLICT (activity_id, start_time) DO NOTHING
                """,
                (activity_id, ATHLETE_ID, effective_at),
            )
            run_id = _insert_activity_run(cur, day)
            cur.execute(
                """
                INSERT INTO derived_metric_facts (
                    athlete_id, subject_type, subject_key, metric_key, unit, value,
                    effective_at, algorithm_version, computation_run_id, method, confidence
                ) VALUES (%s, 'activity', %s, 'tss', 'points', %s, %s, %s, %s, 'test_tss', 1.0)
                ON CONFLICT (
                    athlete_id, subject_type, subject_key, metric_key, effective_at, algorithm_version
                ) DO UPDATE SET value = EXCLUDED.value, computation_run_id = EXCLUDED.computation_run_id
                """,
                (ATHLETE_ID, activity_id, tss, effective_at, ALGORITHM_VERSION, run_id),
            )
    db_conn.commit()


def _insert_activity_run(cur: psycopg.Cursor, day: date) -> UUID:
    cur.execute(
        """
        INSERT INTO computation_runs (
            athlete_id, computation_kind, algorithm_version, input_fingerprint,
            trigger, status, rows_affected, finished_at
        ) VALUES (%s, 'activity_load', %s, %s, 'test', 'success', 1, now())
        RETURNING id
        """,
        (ATHLETE_ID, ALGORITHM_VERSION, _hex_fingerprint(day)),
    )
    return cur.fetchone()[0]


def _hex_fingerprint(day: date) -> str:
    return hashlib.sha256(f"{day.isoformat()}:{uuid4()}".encode()).hexdigest()


def _daily_facts() -> dict[date, dict[str, float]]:
    with psycopg.connect(settings.database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT day, metric_key, value
            FROM current_daily_facts
            WHERE athlete_id = %s AND sport IS NULL
            ORDER BY day, metric_key
            """,
            (ATHLETE_ID,),
        )
        facts: dict[date, dict[str, float]] = {}
        for day, metric_key, value in cur.fetchall():
            facts.setdefault(day, {})[_text(metric_key)] = float(value)
        return facts


def _assert_series_matches(actual: list[float], expected: list[float]) -> None:
    """Compare two day-rows, treating a missing value on both sides as equal.

    ``pytest.approx`` reports NaN != NaN, so an absent ACWR has to be matched
    explicitly rather than swept into the numeric comparison.
    """
    for column, (left, right) in enumerate(zip(actual, expected, strict=True)):
        if math.isnan(left) or math.isnan(right):
            assert math.isnan(left) and math.isnan(right), (
                f"column {column}: only one side has a value ({left} vs {right})"
            )
        else:
            assert left == pytest.approx(right)


def _series_from_facts(facts: dict[date, dict[str, float]]) -> list[list[float]]:
    """Stored daily facts as rows of (tss, ctl, atl, tsb, acwr-or-NaN)."""
    return [
        [metrics.get(key, float("nan")) for key in ("daily_tss", "ctl", "atl", "tsb", "acwr")]
        for _, metrics in sorted(facts.items())
    ]


def _series_values(series: list[dict[str, date | float | None]]) -> list[list[float]]:
    """Domain series in the same shape; a missing ACWR becomes NaN.

    ``pytest.approx`` treats NaN as equal to NaN, which is what lets the two
    sides be compared when ACWR is legitimately absent on both.
    """
    return [
        [
            float("nan") if point[key] is None else float(cast(float, point[key]))
            for key in ("tss", "ctl", "atl", "tsb", "acwr")
        ]
        for point in series
    ]


def _run_status_counts() -> dict[str, int]:
    with psycopg.connect(settings.database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, count(*)
            FROM computation_runs
            WHERE athlete_id = %s AND computation_kind = 'pmc'
            GROUP BY status
            """,
            (ATHLETE_ID,),
        )
        return {_text(status): int(count) for status, count in cur.fetchall()}


def _text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)
