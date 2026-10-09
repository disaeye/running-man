from __future__ import annotations

import anyio
import psycopg
import pytest

from application.computation.orchestration import recompute_after_activity_change
from application.load import recompute as activity_recompute
from application.load.recompute import recompute_activity_load_facts
from tests.integration.recompute_verifier_helpers import (
    ACTIVITY_ID,
    ATHLETE_ID,
    configure_database,
    current_fact_hash,
    run_status_counts,
    seed_idempotency_inputs,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.no_db]

TEST_DSN = "postgresql://postgres@/test_running_man?host=/var/run/postgresql&port=15434"


async def test_ordered_chain_skips_unchanged_inputs_without_fact_diff() -> None:
    configure_database(TEST_DSN)
    seed_idempotency_inputs(TEST_DSN)

    first = await recompute_after_activity_change(ATHLETE_ID, "manual")
    before = current_fact_hash(TEST_DSN)
    second = await recompute_after_activity_change(ATHLETE_ID, "manual")
    after = current_fact_hash(TEST_DSN)

    assert first.activity_load.status == "success"
    assert first.pmc.status == "success"
    assert second.activity_load.status == "skipped"
    assert second.pmc.status == "skipped"
    assert before.fact_hash == after.fact_hash


async def test_orchestration_removes_activity_facts_after_activity_delete() -> None:
    configure_database(TEST_DSN)
    seed_idempotency_inputs(TEST_DSN)
    await recompute_after_activity_change(ATHLETE_ID, "manual")
    before = current_fact_hash(TEST_DSN)

    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE activity_summary SET ignored_at = now() "
            "WHERE athlete_id = %s AND activity_id = %s",
            (ATHLETE_ID, ACTIVITY_ID),
        )
        conn.commit()

    await recompute_after_activity_change(ATHLETE_ID, "delete:activity")
    facts = current_fact_hash(TEST_DSN)
    assert facts.fact_hash != before.fact_hash
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM derived_metric_facts WHERE athlete_id = %s "
            "AND subject_type = 'activity'",
            (ATHLETE_ID,),
        )
        assert cur.fetchone()[0] == 0
        cur.execute(
            "SELECT count(*) FROM derived_metric_facts WHERE athlete_id = %s "
            "AND subject_type = 'day' AND metric_key IN "
            "('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')",
            (ATHLETE_ID,),
        )
        assert cur.fetchone()[0] == 0


async def test_concurrent_duplicate_activity_load_triggers_have_one_writer() -> None:
    configure_database(TEST_DSN)
    seed_idempotency_inputs(TEST_DSN)
    statuses: list[str] = []

    async def trigger() -> None:
        result = await recompute_activity_load_facts(ATHLETE_ID, "concurrent-test")
        statuses.append(result.status)

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(trigger)
        task_group.start_soon(trigger)

    assert sorted(statuses) == ["skipped", "success"]
    assert run_status_counts(TEST_DSN)["success"] == 1


async def test_simulated_failure_preserves_current_facts_and_records_failed_run() -> None:
    configure_database(TEST_DSN)
    seed_idempotency_inputs(TEST_DSN)
    _ = await recompute_activity_load_facts(ATHLETE_ID, "manual")
    before = current_fact_hash(TEST_DSN)
    original_insert = activity_recompute._insert_facts

    async def fail_after_partial_insert(conn, athlete_id, run_id, facts) -> int:
        await original_insert(conn, athlete_id, run_id, facts[:2])
        message = "simulated failure after two rows"
        raise psycopg.OperationalError(message)

    activity_recompute._insert_facts = fail_after_partial_insert
    try:
        _add_changed_input()
        with pytest.raises(psycopg.OperationalError, match="simulated failure"):
            await recompute_activity_load_facts(ATHLETE_ID, "failure-test")
    finally:
        activity_recompute._insert_facts = original_insert

    after = current_fact_hash(TEST_DSN)
    counts = run_status_counts(TEST_DSN)
    assert after.fact_hash == before.fact_hash
    assert counts["failed"] == 1
    assert counts["success"] == 1


def _add_changed_input() -> None:
    """Append one more pace sample so the input fingerprint changes.

    A changed input is what makes the next recompute do work instead of
    skipping; the failure injected above only fires on a run that actually
    writes facts.
    """
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value)
            VALUES ('2026-07-15T00:03:00+00:00', %s, %s, 'distance', 999.0)
            ON CONFLICT DO NOTHING
            """,
            (ACTIVITY_ID, ATHLETE_ID),
        )
        conn.commit()
