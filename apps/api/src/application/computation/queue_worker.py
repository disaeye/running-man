from __future__ import annotations

import logging
from uuid import UUID

import anyio

from application.computation.orchestration import recompute_after_activity_change
from infrastructure.repositories.recompute_jobs import RecomputeJob, RecomputeJobRepo

POLL_INTERVAL_SECONDS = 1.0
EMPTY_POLL_INTERVAL_SECONDS = 3.0
HEARTBEAT_INTERVAL_SECONDS = 30.0
logger = logging.getLogger(__name__)


class RecomputeQueueWorker:
    def __init__(self, repository: RecomputeJobRepo | None = None) -> None:
        self.repository = repository or RecomputeJobRepo()

    async def enqueue(self, athlete_id: UUID, trigger: str) -> int:
        return await self.repository.enqueue(athlete_id, trigger)

    async def run(
        self, task_status: anyio.abc.TaskStatus[None] = anyio.TASK_STATUS_IGNORED
    ) -> None:
        task_status.started()
        while True:
            try:
                job = await self.repository.claim_next()
                if job is None:
                    await anyio.sleep(EMPTY_POLL_INTERVAL_SECONDS)
                    continue
                await self._process(job)
            except Exception:
                logger.exception("重算 worker 执行失败")
                await anyio.sleep(EMPTY_POLL_INTERVAL_SECONDS)

    async def process_pending_once(self, athlete_id: UUID) -> bool:
        job = await self.repository.claim_next(athlete_id)
        if job is None:
            return False
        await self._process(job)
        return True

    async def _process(self, job: RecomputeJob) -> None:
        async with anyio.create_task_group() as task_group:
            task_group.start_soon(self._heartbeat, job)
            try:
                await recompute_after_activity_change(job.athlete_id, job.trigger)
            except Exception as error:
                await self.repository.fail(job, error)
            else:
                await self.repository.complete(job)
            finally:
                task_group.cancel_scope.cancel()

    async def _heartbeat(self, job: RecomputeJob) -> None:
        while True:
            await anyio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            await self.repository.heartbeat(job)


RECOMPUTE_QUEUE = RecomputeQueueWorker()


async def start_recompute_worker(task_group: anyio.abc.TaskGroup) -> None:
    await task_group.start(RECOMPUTE_QUEUE.run)


async def enqueue_activity_recompute(athlete_id: UUID, trigger: str) -> int:
    return await RECOMPUTE_QUEUE.enqueue(athlete_id, trigger)


async def run_queued_recompute_once(athlete_id: UUID | None = None) -> bool:
    job = await RECOMPUTE_QUEUE.repository.claim_next(athlete_id)
    if job is None:
        return False
    await RECOMPUTE_QUEUE._process(job)
    return True
