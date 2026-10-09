from __future__ import annotations

from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class ShareRepo:
    async def create(self, athlete_id: UUID, activity_id: str, token: UUID) -> UUID:
        query = """
        INSERT INTO share_tokens (token, athlete_id, activity_id) VALUES (%s, %s, %s)
        RETURNING token
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (token, athlete_id, activity_id))
            row = await cur.fetchone()
        return row["token"] if row else token

    async def revoke(self, athlete_id: UUID, activity_id: str) -> bool:
        query = """
        UPDATE share_tokens SET revoked_at = now()
        WHERE athlete_id = %s AND activity_id = %s AND revoked_at IS NULL
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            return cur.rowcount > 0

    async def get_activity_for_token(self, token: UUID) -> dict[str, object] | None:
        query = """
        SELECT a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s, a.raw_data
        FROM share_tokens st JOIN activity_summary a
          ON a.athlete_id = st.athlete_id AND a.activity_id = st.activity_id
        WHERE st.token = %s AND st.revoked_at IS NULL
          AND (st.expires_at IS NULL OR st.expires_at > now())
        ORDER BY a.start_time DESC LIMIT 1
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (token,))
            row = await cur.fetchone()
        return dict(row) if row else None
