"""手动上传批次的运行记录：写入 integration_sync_runs（source='manual'）。

让上传的成功率与失败原因进入同步历史，供数据质量检查统计。
"""

from __future__ import annotations

from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


async def start_upload_run(athlete_id: UUID, *, files: int) -> UUID | None:
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            """
            INSERT INTO integration_sync_runs
                (athlete_id, source, trigger, status, activities_seen)
            VALUES (%s, 'manual', 'upload', 'running', %s)
            RETURNING id
            """,
            (athlete_id, files),
        )
        row = await cur.fetchone()
    return row["id"] if row else None


async def finish_upload_run(
    run_id: UUID | None,
    *,
    status: str,
    activities_seen: int,
    activities_upserted: int,
    activities_deduplicated: int,
    errors_count: int,
    streams_inserted: int = 0,
    error_summary: str | None = None,
) -> None:
    if run_id is None:
        return
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            """
            UPDATE integration_sync_runs
            SET finished_at = now(), status = %s,
                activities_seen = %s,
                activities_upserted = %s,
                activities_deduplicated = %s,
                streams_inserted = %s,
                errors_count = %s,
                error_summary = %s
            WHERE id = %s
            """,
            (
                status,
                activities_seen,
                activities_upserted,
                activities_deduplicated,
                streams_inserted,
                errors_count,
                error_summary,
                run_id,
            ),
        )
