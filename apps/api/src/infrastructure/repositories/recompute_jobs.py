from __future__ import annotations

from dataclasses import dataclass
from typing import cast
from uuid import UUID, uuid4

from psycopg.rows import DictRow

from infrastructure.db.pool import get_pool, open_pool

LEASE_SECONDS = 120


@dataclass(frozen=True, slots=True)
class RecomputeJob:
    athlete_id: UUID
    trigger: str
    generation: int
    claimed_generation: int
    attempts: int
    claimed_token: UUID


class RecomputeJobRepo:
    async def enqueue(self, athlete_id: UUID, trigger: str) -> int:
        await open_pool()
        query = """
        INSERT INTO activity_recompute_jobs (
            athlete_id, status, trigger, generation, requested_at, available_at, attempts
        ) VALUES (%s, 'pending', %s, 1, now(), now(), 0)
        ON CONFLICT (athlete_id) DO UPDATE SET
            status = CASE WHEN activity_recompute_jobs.status = 'running'
                THEN 'running' ELSE 'pending' END,
            trigger = EXCLUDED.trigger,
            generation = activity_recompute_jobs.generation + 1,
            requested_at = now(),
            available_at = now(),
            attempts = CASE WHEN activity_recompute_jobs.status = 'running'
                THEN activity_recompute_jobs.attempts ELSE 0 END,
            claimed_at = CASE WHEN activity_recompute_jobs.status = 'running'
                THEN activity_recompute_jobs.claimed_at ELSE NULL END,
            claimed_generation = CASE WHEN activity_recompute_jobs.status = 'running'
                THEN activity_recompute_jobs.claimed_generation ELSE NULL END,
            finished_at = NULL,
            last_error = NULL
        RETURNING generation
        """
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, trigger[:200]))
            row = await cur.fetchone()
            await conn.commit()
        if row is None:
            raise RuntimeError("recompute job enqueue returned no generation")
        return int(row["generation"])

    async def claim_next(self, athlete_id: UUID | None = None) -> RecomputeJob | None:
        await open_pool()
        query = f"""
        WITH candidate AS (
            SELECT athlete_id
            FROM activity_recompute_jobs
            WHERE (
                (status IN ('pending', 'failed') AND available_at <= now())
                OR (status = 'running' AND claimed_at < now() - interval '{LEASE_SECONDS} seconds')
            )
              AND (%s::uuid IS NULL OR athlete_id = %s)
            ORDER BY requested_at, athlete_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE activity_recompute_jobs AS jobs
        SET status = 'running', attempts = jobs.attempts + 1,
            claimed_at = now(), claimed_generation = jobs.generation,
            claimed_token = %s, last_error = NULL
        FROM candidate
        WHERE jobs.athlete_id = candidate.athlete_id
        RETURNING jobs.athlete_id, jobs.trigger, jobs.generation,
                  jobs.claimed_generation, jobs.attempts, jobs.claimed_token
        """
        claimed_token = uuid4()
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, athlete_id, claimed_token))
            row = await cur.fetchone()
            await conn.commit()
        if row is None:
            return None
        return RecomputeJob(
            athlete_id=cast(UUID, row["athlete_id"]),
            trigger=str(row["trigger"]),
            generation=int(row["generation"]),
            claimed_generation=int(row["claimed_generation"]),
            attempts=int(row["attempts"]),
            claimed_token=cast(UUID, row["claimed_token"]),
        )

    async def heartbeat(self, job: RecomputeJob) -> None:
        await open_pool()
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "UPDATE activity_recompute_jobs SET claimed_at = now() "
                "WHERE athlete_id = %s AND status = 'running' AND claimed_token = %s",
                (job.athlete_id, job.claimed_token),
            )
            await conn.commit()

    async def complete(self, job: RecomputeJob) -> None:
        await open_pool()
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "UPDATE activity_recompute_jobs SET status = 'pending', attempts = 0, "
                "available_at = now(), claimed_at = NULL, claimed_generation = NULL, "
                "claimed_token = NULL, finished_at = NULL, last_error = NULL "
                "WHERE athlete_id = %s AND status = 'running' "
                "AND claimed_token = %s AND generation <> %s",
                (job.athlete_id, job.claimed_token, job.claimed_generation),
            )
            if cur.rowcount == 0:
                _ = await cur.execute(
                    "UPDATE activity_recompute_jobs SET status = 'succeeded', "
                    "attempts = 0, claimed_at = NULL, claimed_generation = NULL, "
                    "claimed_token = NULL, finished_at = now(), last_error = NULL "
                    "WHERE athlete_id = %s AND status = 'running' "
                    "AND claimed_token = %s AND generation = %s",
                    (job.athlete_id, job.claimed_token, job.claimed_generation),
                )
            await conn.commit()

    async def fail(self, job: RecomputeJob, error: Exception) -> None:
        await open_pool()
        message = f"{type(error).__name__}: {error}"[:2000]
        query = """
        UPDATE activity_recompute_jobs SET
            status = CASE WHEN generation = %s THEN 'failed' ELSE 'pending' END,
            available_at = CASE WHEN generation = %s
                THEN now() + LEAST(900, 5 * power(2, LEAST(attempts - 1, 8))) * interval '1 second'
                ELSE now() END,
            attempts = CASE WHEN generation = %s THEN attempts ELSE 0 END,
            claimed_at = NULL,
            claimed_generation = NULL,
            claimed_token = NULL,
            finished_at = CASE WHEN generation = %s THEN now() ELSE NULL END,
            last_error = %s
        WHERE athlete_id = %s AND status = 'running' AND claimed_token = %s
        """
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                query,
                (
                    job.claimed_generation,
                    job.claimed_generation,
                    job.claimed_generation,
                    job.claimed_generation,
                    message,
                    job.athlete_id,
                    job.claimed_token,
                ),
            )
            await conn.commit()

    async def get_status(self, athlete_id: UUID) -> DictRow | None:
        await open_pool()
        async with get_pool().connection() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT status, trigger, requested_at, finished_at, attempts, generation, "
                "last_error FROM activity_recompute_jobs WHERE athlete_id = %s",
                (athlete_id,),
            )
            return await cur.fetchone()

