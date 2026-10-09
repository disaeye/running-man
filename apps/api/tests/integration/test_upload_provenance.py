"""上传批次运行记录仓储的集成测试（真实测试库）。

start_upload_run / finish_upload_run 走真实 SQL；在一个未提交的
AsyncConnection 事务内执行并断言，结束回滚，不向测试库残留数据。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import TEST_DSN
from infrastructure.repositories.upload_provenance import (
    finish_upload_run,
    start_upload_run,
)

pytestmark = pytest.mark.asyncio


class _AdHocPool:
    """把固定的 AsyncConnection 伪装成连接池，绕开会话级全局池的事件循环绑定。"""

    def __init__(self, conn: psycopg.AsyncConnection) -> None:
        self._conn = conn

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[psycopg.AsyncConnection]:
        yield self._conn


async def test_upload_run_lifecycle_records_success() -> None:
    conn = await psycopg.AsyncConnection.connect(TEST_DSN, row_factory=dict_row)
    try:
        async with conn.cursor() as cur:
            athlete_id = uuid4()
            await cur.execute(
                "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, %s)",
                (athlete_id, f"upload-{athlete_id}@example.com", "hash"),
            )

        pool = _AdHocPool(conn)
        with pytest.MonkeyPatch.context() as monkeypatch:
            monkeypatch.setattr(
                "infrastructure.repositories.upload_provenance.get_pool", lambda: pool
            )
            run_id = await start_upload_run(athlete_id, files=2)
            assert run_id is not None
            await finish_upload_run(
                run_id,
                status="failed",
                activities_seen=2,
                activities_upserted=1,
                activities_deduplicated=0,
                errors_count=1,
                error_summary="bad.fit: parse error",
            )

        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT source, trigger, status, activities_seen, activities_upserted, "
                "errors_count, error_summary, finished_at "
                "FROM integration_sync_runs WHERE id = %s",
                (run_id,),
            )
            row = await cur.fetchone()
        assert row is not None
        assert row["source"] == "manual"
        assert row["trigger"] == "upload"
        assert row["status"] == "failed"
        assert row["activities_seen"] == 2
        assert row["activities_upserted"] == 1
        assert row["errors_count"] == 1
        assert row["error_summary"] == "bad.fit: parse error"
        assert row["finished_at"] is not None
    finally:
        await conn.rollback()
        await conn.close()
