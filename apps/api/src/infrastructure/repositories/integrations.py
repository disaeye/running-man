import json
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class UserIntegrationRepo:
    async def list(self, athlete_id: UUID) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _SELECT_SQL + " WHERE athlete_id = %s ORDER BY source", (athlete_id,)
            )
            return [dict(row) for row in await cur.fetchall()]

    async def get(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _SELECT_SQL + " WHERE athlete_id = %s AND source = %s", (athlete_id, source)
            )
            row = await cur.fetchone()
            return dict(row) if row else None

    async def upsert(
        self, athlete_id: UUID, source: str, data: dict[str, object]
    ) -> dict[str, object]:
        credentials = _json(data.get("credentials"))
        settings = _json(data.get("settings", {}))
        connected = bool(data.get("connected", True))
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _UPSERT_SQL, (athlete_id, source, connected, credentials, settings)
            )
            row = await cur.fetchone()
        assert row is not None
        return dict(row)

    async def delete(self, athlete_id: UUID, source: str) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM user_integrations WHERE athlete_id = %s AND source = %s",
                (athlete_id, source),
            )
            return cur.rowcount > 0

    async def update_sync_status(
        self,
        athlete_id: UUID,
        source: str,
        status: str,
        error: str | None,
        detail: dict[str, object] | None = None,
    ) -> dict[str, object] | None:
        sync_detail = _json(detail) if detail is not None else None
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                _UPDATE_STATUS_SQL,
                (status, error, sync_detail, athlete_id, source),
            )
            row = await cur.fetchone()
            return dict(row) if row else None

    async def clear_sync_state(self, athlete_id: UUID, source: str | None = None) -> int:
        async with _connect() as conn, conn.cursor() as cur:
            if source is None:
                _ = await cur.execute(_CLEAR_SYNC_ALL_SQL, (athlete_id,))
            else:
                _ = await cur.execute(_CLEAR_SYNC_SQL, (athlete_id, source))
            return cur.rowcount


def _json(value: object) -> str:
    return json.dumps(value or {}, ensure_ascii=True)


_SELECT_SQL = """
SELECT id, athlete_id, source, connected, credentials, settings, last_sync_at,
       last_sync_status, last_sync_error, last_sync_detail, created_at, updated_at
FROM user_integrations
"""

_UPSERT_SQL = """
INSERT INTO user_integrations (athlete_id, source, connected, credentials, settings, updated_at)
VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, now())
ON CONFLICT (athlete_id, source) DO UPDATE SET
    connected = EXCLUDED.connected,
    credentials = EXCLUDED.credentials,
    settings = COALESCE(EXCLUDED.settings, user_integrations.settings),
    last_sync_error = NULL,
    updated_at = now()
RETURNING id, athlete_id, source, connected, credentials, settings, last_sync_at,
          last_sync_status, last_sync_error, last_sync_detail, created_at, updated_at
"""

_UPDATE_STATUS_SQL = """
UPDATE user_integrations SET last_sync_at = now(), last_sync_status = %s,
    last_sync_error = %s,
    last_sync_detail = COALESCE(%s::jsonb, last_sync_detail),
    updated_at = now()
WHERE athlete_id = %s AND source = %s
RETURNING id, athlete_id, source, connected, credentials, settings, last_sync_at,
          last_sync_status, last_sync_error, last_sync_detail, created_at, updated_at
"""

_CLEAR_SYNC_SQL = """
UPDATE user_integrations SET last_sync_at = NULL, last_sync_status = NULL,
    last_sync_error = NULL, last_sync_detail = NULL, updated_at = now()
WHERE athlete_id = %s AND source = %s
"""

_CLEAR_SYNC_ALL_SQL = """
UPDATE user_integrations SET last_sync_at = NULL, last_sync_status = NULL,
    last_sync_error = NULL, last_sync_detail = NULL, updated_at = now()
WHERE athlete_id = %s
"""
