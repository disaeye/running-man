from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


async def list_notifications(
    athlete_id: UUID, unread_only: bool = False
) -> list[dict[str, object]]:
    query = """
    SELECT id, athlete_id, type, title, body, severity, read, created_at
    FROM notifications
    WHERE athlete_id = %s AND (%s = false OR read = false)
    ORDER BY created_at DESC, id DESC
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, unread_only))
        return [dict(row) for row in await cur.fetchall()]


async def create_notification(
    athlete_id: UUID,
    type: str,
    title: str,
    body: str | None,
    severity: str = "info",
) -> dict[str, object]:
    query = """
    INSERT INTO notifications (athlete_id, type, title, body, severity)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING id, athlete_id, type, title, body, severity, read, created_at
    """
    values = (athlete_id, type, title, body, severity)
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, values)
        row = await cur.fetchone()
    assert row is not None
    return dict(row)


async def mark_read(notification_id: UUID, athlete_id: UUID) -> bool:
    query = """
    UPDATE notifications
    SET read = true
    WHERE id = %s AND athlete_id = %s
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (notification_id, athlete_id))
        return cur.rowcount > 0


async def mark_all_read(athlete_id: UUID) -> int:
    query = """
    UPDATE notifications
    SET read = true
    WHERE athlete_id = %s AND read = false
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return cur.rowcount
