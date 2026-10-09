from __future__ import annotations

from uuid import UUID, uuid4

import psycopg
import pytest

from application.computation.queue_worker import RecomputeQueueWorker
from conftest import TEST_DSN
from infrastructure.repositories.recompute_jobs import RecomputeJobRepo

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]



async def test_queue_coalesces_requests_and_persists_generation(db_conn: psycopg.Connection) -> None:
    athlete_id = _new_athlete(db_conn)
    repository = RecomputeJobRepo()

    first = await repository.enqueue(athlete_id, "upload")
    second = await repository.enqueue(athlete_id, "manual_activity")
    row = await repository.get_status(athlete_id)

    assert first == 1
    assert second == 2
    assert row is not None
    assert row["status"] == "pending"
    assert row["generation"] == 2
    assert row["trigger"] == "manual_activity"
    _delete_athlete(db_conn, athlete_id)


async def test_queue_recovers_running_lease_after_worker_restart(
    db_conn: psycopg.Connection,
) -> None:
    athlete_id = _new_athlete(db_conn)
    repository = RecomputeJobRepo()
    generation = await repository.enqueue(athlete_id, "test-restart")
    job = await repository.claim_next(athlete_id)
    assert job is not None

    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE activity_recompute_jobs SET claimed_at = now() - interval '5 minutes' "
            "WHERE athlete_id = %s",
            (athlete_id,),
        )
    db_conn.commit()

    recovered = await repository.claim_next(athlete_id)
    assert recovered is not None
    assert recovered.generation == generation
    assert recovered.claimed_token != job.claimed_token
    await repository.complete(recovered)
    status = await repository.get_status(athlete_id)
    assert status is not None
    assert status["status"] == "succeeded"
    _delete_athlete(db_conn, athlete_id)


async def test_failed_job_is_retryable_and_stale_worker_is_fenced(
    db_conn: psycopg.Connection,
) -> None:
    athlete_id = _new_athlete(db_conn)
    repository = RecomputeJobRepo()
    await repository.enqueue(athlete_id, "test-failure")
    original = await repository.claim_next(athlete_id)
    assert original is not None
    await repository.fail(original, RuntimeError("test failure"))
    failed = await repository.get_status(athlete_id)
    assert failed is not None
    assert failed["status"] == "failed"
    assert failed["last_error"] == "RuntimeError: test failure"

    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE activity_recompute_jobs SET available_at = now() - interval '1 second' "
            "WHERE athlete_id = %s",
            (athlete_id,),
        )
    db_conn.commit()

    retry = await repository.claim_next(athlete_id)
    assert retry is not None
    assert retry.claimed_token != original.claimed_token
    await repository.complete(original)
    still_running = await repository.get_status(athlete_id)
    assert still_running is not None
    assert still_running["status"] == "running"
    await repository.complete(retry)
    _delete_athlete(db_conn, athlete_id)


async def test_worker_clears_activity_and_pmc_facts_when_history_is_empty(
    db_conn: psycopg.Connection,
) -> None:
    from infrastructure.auth.settings import settings
    from infrastructure.db.pool import close_pool, open_pool

    settings.database_url = TEST_DSN
    await close_pool()
    await open_pool()
    athlete_id = _new_athlete(db_conn)
    _seed_old_facts(db_conn, athlete_id)
    await RecomputeJobRepo().enqueue(athlete_id, "clear:all")
    worker = RecomputeQueueWorker()
    _clear_activity_history(db_conn, athlete_id)
    _reset_run_fingerprint(db_conn, athlete_id)

    assert await worker.process_pending_once(athlete_id)

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM derived_metric_facts WHERE athlete_id = %s "
            "AND subject_type = 'activity' AND metric_key = 'tss'",
            (athlete_id,),
        )
        assert cur.fetchone()[0] == 0
        cur.execute(
            "SELECT count(*) FROM derived_metric_facts WHERE athlete_id = %s "
            "AND subject_type = 'day' AND metric_key IN "
            "('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')",
            (athlete_id,),
        )
        assert cur.fetchone()[0] == 0
    status = await RecomputeJobRepo().get_status(athlete_id)
    assert status is not None
    assert status["status"] == "succeeded"
    _delete_athlete(db_conn, athlete_id)
    await close_pool()


async def test_status_endpoint_is_scoped_to_authenticated_athlete(
    db_conn: psycopg.Connection,
) -> None:
    from httpx import ASGITransport, AsyncClient

    from infrastructure.auth.models import Athlete as AthleteModel
    from main import app
    from presentation.auth.deps import get_current_athlete

    athlete_id = _new_athlete(db_conn)
    other_id = _new_athlete(db_conn)
    own_generation = await RecomputeJobRepo().enqueue(athlete_id, "upload")
    await RecomputeJobRepo().enqueue(other_id, "sync")
    athlete = AthleteModel(athlete_id, f"{athlete_id}@queue.test", "hash")
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/data/recompute-status")
        assert response.status_code == 200
        assert response.json()["generation"] == own_generation
        assert response.json()["status"] == "pending"
        assert response.json()["last_error"] is None
    finally:
        app.dependency_overrides.pop(get_current_athlete, None)
        _delete_athlete(db_conn, athlete_id)
        _delete_athlete(db_conn, other_id)


def _new_athlete(conn: psycopg.Connection) -> UUID:
    athlete_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@queue.test"),
        )
    conn.commit()
    return athlete_id


def _delete_athlete(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
    conn.commit()


def _clear_activity_history(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (athlete_id,))
    conn.commit()


def _reset_run_fingerprint(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM derived_metric_facts WHERE athlete_id = %s",
            (athlete_id,),
        )
        cur.execute(
            "DELETE FROM computation_runs WHERE athlete_id = %s AND status = 'success'",
            (athlete_id,),
        )
    conn.commit()


def _seed_old_facts(conn: psycopg.Connection, athlete_id: UUID) -> None:
    from datetime import UTC, datetime

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO computation_runs (athlete_id, computation_kind, algorithm_version, "
            "input_fingerprint, trigger, status) VALUES (%s, 'activity_load', '1.0.0', "
            "%s, 'test', 'success') RETURNING id",
            (athlete_id, "a" * 64),
        )
        run_id = cur.fetchone()[0]
        cur.executemany(
            "INSERT INTO derived_metric_facts (athlete_id, subject_type, subject_key, metric_key, "
            "unit, value, effective_at, algorithm_version, computation_run_id, method, confidence) "
            "VALUES (%s, %s, %s, %s, %s, 10, %s, '1.0.0', %s, 'test', 1.0)",
            [
                (athlete_id, "activity", "old-run", "tss", "points", datetime(2026, 1, 1, tzinfo=UTC), run_id),
                (athlete_id, "day", "2026-01-01", "daily_tss", "points", datetime(2026, 1, 1, tzinfo=UTC), run_id),
                (athlete_id, "day", "2026-01-01", "ctl", "points", datetime(2026, 1, 1, tzinfo=UTC), run_id),
            ],
        )
    conn.commit()
