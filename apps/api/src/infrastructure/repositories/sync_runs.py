from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class SyncRunRepo:
    async def list(
        self,
        athlete_id: UUID,
        source: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, object]]:
        query = """
        SELECT id, source, trigger, window_start, window_end, started_at, finished_at, status,
               activities_seen, activities_upserted, activities_deduplicated, wellness_seen,
               streams_inserted, errors_count, error_summary, detail
        FROM integration_sync_runs
        WHERE athlete_id = %s
        """
        params: list[object] = [athlete_id]
        if source:
            query += " AND source = %s"
            params.append(source)
        if status:
            query += " AND status = %s"
            params.append(status)
        query += " ORDER BY started_at DESC LIMIT %s"
        params.append(limit)

        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, tuple(params))
            return [dict(row) for row in await cur.fetchall()]
