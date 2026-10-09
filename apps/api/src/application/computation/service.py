from __future__ import annotations

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any, Generic, TypeAlias, TypeVar
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from application.computation.runs import (
    RUN_REPOSITORY,
    ComputationRunRepository,
    ComputationRunResult,
    ComputationRunSpec,
)
from infrastructure.db.pool import get_pool, open_pool

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class PreparedComputation(Generic[T]):
    spec: ComputationRunSpec
    payload: T


PrepareComputation: TypeAlias = Callable[
    [psycopg.AsyncConnection[DictRow]], Coroutine[Any, Any, PreparedComputation[T]]
]
WriteComputation: TypeAlias = Callable[
    [psycopg.AsyncConnection[DictRow], UUID, T], Coroutine[Any, Any, int]
]


@dataclass(frozen=True, slots=True)
class ComputationExecution(Generic[T]):
    athlete_id: UUID
    computation_kind: str
    prepare: PrepareComputation[T]
    write: WriteComputation[T]
    repository: ComputationRunRepository = RUN_REPOSITORY


async def execute_idempotent_computation(
    execution: ComputationExecution[T],
) -> ComputationRunResult:
    await open_pool()
    async with get_pool().connection() as conn:
        await execution.repository.acquire_kind_lock(
            conn, execution.athlete_id, execution.computation_kind
        )
        try:
            prepared = await execution.prepare(conn)
            existing_run_id = await execution.repository.successful_run_id(conn, prepared.spec)
            if existing_run_id is not None:
                run_id = await execution.repository.insert_run(conn, prepared.spec, "skipped")
                await conn.commit()
                return ComputationRunResult(run_id, "skipped", 0)

            run_id = await execution.repository.insert_run(conn, prepared.spec, "running")
            await conn.commit()
            try:
                rows_affected = await execution.write(conn, run_id, prepared.payload)
                await execution.repository.finish_run(conn, run_id, "success", rows_affected)
                await conn.commit()
                return ComputationRunResult(run_id, "success", rows_affected)
            except psycopg.Error:
                await conn.rollback()
                await execution.repository.finish_run(conn, run_id, "failed", 0)
                await conn.commit()
                raise
        finally:
            await execution.repository.release_kind_lock(
                conn, execution.athlete_id, execution.computation_kind
            )
