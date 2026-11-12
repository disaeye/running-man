from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final, Literal, cast
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

RunStatus = Literal["running", "success", "failed", "skipped"]

_LOCK_SEED: Final = 0


@dataclass(frozen=True, slots=True)
class ComputationRunSpec:
    athlete_id: UUID
    computation_kind: str
    algorithm_version: str
    input_fingerprint: str
    trigger: str
    input_window_start: datetime | None = None
    input_window_end: datetime | None = None


@dataclass(frozen=True, slots=True)
class ComputationRunResult:
    computation_run_id: UUID
    status: RunStatus
    rows_affected: int


class ComputationRunRepository:
    async def acquire_kind_lock(
        self, conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID, kind: str
    ) -> None:
        async with conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT pg_advisory_lock(hashtextextended(%s, %s))",
                (f"{athlete_id}|{kind}", _LOCK_SEED),
            )

    async def release_kind_lock(
        self, conn: psycopg.AsyncConnection[DictRow], athlete_id: UUID, kind: str
    ) -> None:
        async with conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT pg_advisory_unlock(hashtextextended(%s, %s))",
                (f"{athlete_id}|{kind}", _LOCK_SEED),
            )

    async def successful_run_id(
        self, conn: psycopg.AsyncConnection[DictRow], spec: ComputationRunSpec
    ) -> UUID | None:
        """The run whose result this input fingerprint can reuse, if any.

        A matching run is not enough on its own. Raw data can be cleared and
        re-imported unchanged, which empties the derived rows while leaving the
        fingerprint identical; trusting the run row then skipped the rebuild
        and left the athlete with no load facts at all. A skip therefore also
        requires that the previous run's product still exists.

        A run that wrote no rows is trusted as-is: there is nothing to lose by
        skipping, and re-running it on every pass would rebuild nothing.
        """
        query = """
        SELECT id, rows_affected
        FROM computation_runs
        WHERE athlete_id = %s AND computation_kind = %s
          AND algorithm_version = %s AND input_fingerprint = %s AND status = 'success'
        LIMIT 1
        """
        async with conn.cursor() as cur:
            _ = await cur.execute(
                query,
                (
                    spec.athlete_id,
                    spec.computation_kind,
                    spec.algorithm_version,
                    spec.input_fingerprint,
                ),
            )
            row = await cur.fetchone()
        if row is None:
            return None
        run_id = cast(UUID, row["id"])
        if int(cast(int, row["rows_affected"] or 0)) > 0 and not await self.run_products_present(
            conn, run_id
        ):
            return None
        return run_id

    async def run_products_present(
        self, conn: psycopg.AsyncConnection[DictRow], run_id: UUID
    ) -> bool:
        """Whether any stored result still points at this computation run."""
        query = """
        SELECT (
            EXISTS (SELECT 1 FROM derived_metric_facts WHERE computation_run_id = %s)
            OR EXISTS (SELECT 1 FROM athlete_thresholds WHERE computation_run_id = %s)
            OR EXISTS (SELECT 1 FROM athletes WHERE physiology_computation_run_id = %s)
        ) AS present
        """
        async with conn.cursor() as cur:
            _ = await cur.execute(query, (run_id, run_id, run_id))
            row = await cur.fetchone()
        return bool(row and row["present"])

    async def insert_run(
        self,
        conn: psycopg.AsyncConnection[DictRow],
        spec: ComputationRunSpec,
        status: RunStatus,
        rows_affected: int = 0,
        detail: Mapping[str, object] | None = None,
    ) -> UUID:
        query = """
        INSERT INTO computation_runs (
            athlete_id, computation_kind, algorithm_version, input_fingerprint,
            trigger, input_window_start, input_window_end, status, rows_affected,
            finished_at, detail
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id
        """
        finished_at = datetime.now(UTC) if status != "running" else None
        payload = json.dumps(dict(detail or {}), ensure_ascii=True, sort_keys=True)
        async with conn.cursor() as cur:
            _ = await cur.execute(
                query,
                (
                    spec.athlete_id,
                    spec.computation_kind,
                    spec.algorithm_version,
                    spec.input_fingerprint,
                    spec.trigger,
                    spec.input_window_start,
                    spec.input_window_end,
                    status,
                    rows_affected,
                    finished_at,
                    payload,
                ),
            )
            row = await cur.fetchone()
        assert row is not None
        return cast(UUID, row["id"])

    async def finish_run(
        self,
        conn: psycopg.AsyncConnection[DictRow],
        run_id: UUID,
        status: Literal["success", "failed"],
        rows_affected: int,
        detail: Mapping[str, object] | None = None,
    ) -> None:
        query = """
        UPDATE computation_runs
        SET status = %s, rows_affected = %s, finished_at = now(),
            updated_at = now(), detail = detail || %s::jsonb
        WHERE id = %s
        """
        payload = json.dumps(dict(detail or {}), ensure_ascii=True, sort_keys=True)
        async with conn.cursor() as cur:
            _ = await cur.execute(query, (status, rows_affected, payload, run_id))


RUN_REPOSITORY = ComputationRunRepository()
