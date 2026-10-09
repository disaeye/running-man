from infrastructure.db.pool import ConnectionContext, get_pool
from presentation.webhooks.schemas import CalendarEvent, DeletedEvent


def _connect() -> ConnectionContext:
    return get_pool().connection()


class WebhookEventStore:
    async def insert_once(self, event_key: str, event_type: str, athlete_id: str | None) -> bool:
        query = """
        INSERT INTO webhook_events (event_key, event_type, athlete_id) VALUES (%s, %s, %s)
        ON CONFLICT (event_key) DO NOTHING RETURNING event_key
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (event_key, event_type, athlete_id))
            return await cur.fetchone() is not None


class WebhookEffectRepo:
    async def update_activity_analysis(
        self,
        activity_id: str,
        _tss: float | None,
        _np: float | None,
        icu_ctl: float | None,
    ) -> None:
        query = """
        UPDATE activity_summary
        SET icu_ctl = COALESCE(%s, icu_ctl)
        WHERE activity_id = %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (icu_ctl, activity_id))

    async def upsert_calendar_event(self, athlete_id: str, event: CalendarEvent) -> None:
        query = """
        INSERT INTO training_calendar
        (event_id, athlete_id, start_time, category, sport_type, name, workout_xml,
         predicted_tss, external_id, status)
        VALUES (%s, %s, COALESCE(%s::timestamptz, now()), %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (event_id) DO UPDATE SET start_time = EXCLUDED.start_time,
        category = EXCLUDED.category,
        sport_type = EXCLUDED.sport_type, name = EXCLUDED.name, workout_xml = EXCLUDED.workout_xml,
        predicted_tss = EXCLUDED.predicted_tss, external_id = EXCLUDED.external_id,
        status = EXCLUDED.status
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                query,
                (
                    event.id,
                    athlete_id,
                    event.start_time,
                    event.category,
                    event.sport_type,
                    event.name,
                    event.workout_xml,
                    event.predicted_tss,
                    event.oauth_client_id,
                    event.status,
                ),
            )

    async def delete_calendar_event(self, event: DeletedEvent) -> None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "UPDATE training_calendar SET status = 'deleted' WHERE event_id = %s",
                (event.id,),
            )

    async def mark_settings_stale(self, _athlete_id: str | None) -> None:
        return None
