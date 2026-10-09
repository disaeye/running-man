from collections.abc import Awaitable
from typing import Protocol
from uuid import UUID, uuid4

import pytest

from conftest import TEST_DSN
from infrastructure.auth.settings import settings
from infrastructure.db.pool import close_pool, get_pool, open_pool
from infrastructure.repositories.integrations import UserIntegrationRepo

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]


class AsyncCursorLike(Protocol):
    def execute(self, query: str, params: object = ()) -> Awaitable[object]: ...


async def test_user_integration_repo_upsert_get_list_status_delete() -> None:
    await _use_pool()
    athlete_id = uuid4()
    await _seed(athlete_id)
    repo = UserIntegrationRepo()

    created = await repo.upsert(athlete_id, "intervals_icu", _payload("cipher-1"))
    assert created["connected"] is True
    assert created["credentials"] == {"ciphertext": "cipher-1"}
    fetched = await repo.get(athlete_id, "intervals_icu")
    assert fetched is not None
    assert fetched["source"] in ("intervals_icu", b"intervals_icu")
    assert [row["source"] for row in await repo.list(athlete_id)] in (
        ["intervals_icu"],
        [b"intervals_icu"],
    )

    updated = await repo.upsert(athlete_id, "intervals_icu", _payload("cipher-2"))
    assert updated["credentials"] == {"ciphertext": "cipher-2"}
    assert updated["settings"] == {"auto_sync": True}

    status_row = await repo.update_sync_status(athlete_id, "intervals_icu", "failed", "boom")
    assert status_row is not None
    assert status_row["last_sync_status"] in ("failed", b"failed")
    assert status_row["last_sync_error"] in ("boom", b"boom")

    assert await repo.delete(athlete_id, "intervals_icu") is True
    assert await repo.get(athlete_id, "intervals_icu") is None
    await _cleanup(athlete_id)


async def _use_pool() -> None:
    await close_pool()
    settings.database_url = TEST_DSN
    await open_pool()


async def _seed(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await _ensure_schema(cur)
        _ = await cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@example.com"),
        )


async def _cleanup(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute("DELETE FROM user_integrations WHERE athlete_id = %s", (athlete_id,))
        _ = await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
    # 不关闭全局连接池：会话级 fixture 负责它的生命周期，
    # 提前关闭会让后续使用连接池的测试拿到未打开的池对象。


def _payload(ciphertext: str) -> dict[str, object]:
    return {
        "connected": True,
        "credentials": {"ciphertext": ciphertext},
        "settings": {"auto_sync": True},
    }


async def _ensure_schema(cur: AsyncCursorLike) -> None:
    _ = await cur.execute("""
    CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id UUID NOT NULL REFERENCES athletes(id),
        source VARCHAR(50) NOT NULL, connected BOOLEAN DEFAULT FALSE, credentials JSONB,
        settings JSONB DEFAULT '{}', last_sync_at TIMESTAMPTZ, last_sync_status VARCHAR(20),
        last_sync_error TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(athlete_id, source))
    """)
    _ = await cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_integrations_athlete ON user_integrations(athlete_id)"
    )
