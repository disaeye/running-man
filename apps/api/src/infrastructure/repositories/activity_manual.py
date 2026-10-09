import json
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


async def create_manual_activity(
    athlete_id: UUID,
    activity: dict[str, object],
    event_link: dict[str, object] | None = None,
) -> dict[str, object]:
    query = """
    INSERT INTO activity_summary (
        activity_id, athlete_id, start_time, sport, distance_m, duration_s,
        avg_hr, max_hr, external_id, source, file_type, device_name, raw_data,
        has_gps, has_hr, has_power, has_cadence, has_streams, stream_sample_count
    ) VALUES (
        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
        %s::jsonb, false, %s, false, false, false, 0
    ) RETURNING activity_id, start_time, sport, distance_m, duration_s, avg_hr, max_hr
    """
    values = (
        activity["activity_id"],
        athlete_id,
        activity["start_time"],
        activity["sport"],
        activity.get("distance_m"),
        activity["duration_s"],
        activity.get("avg_hr"),
        activity.get("max_hr"),
        activity["external_id"],
        activity["source"],
        activity["file_type"],
        activity["name"],
        json.dumps(activity["raw_data"], ensure_ascii=True),
        activity.get("avg_hr") is not None,
    )
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, values)
        row = await cur.fetchone()
        if row is None:
            raise RuntimeError("manual activity insert returned no row")
        if event_link is not None:
            raw_data = cast(dict[str, object], activity["raw_data"])
            _ = await cur.execute(
                """
                UPDATE training_calendar SET done = true, status = 'completed',
                    linked_activity_id = %s, completed_distance_m = %s,
                    completed_duration_s = %s, completed_avg_hr = %s,
                    completed_rpe = %s, actual_logged_at = now()
                WHERE athlete_id = %s AND event_id = %s
                  AND (start_time AT TIME ZONE %s)::date = %s
                  AND status = 'planned' AND done = false AND linked_activity_id IS NULL
                RETURNING event_id
                """,
                (
                    activity["activity_id"],
                    activity.get("distance_m"),
                    activity["duration_s"],
                    activity.get("avg_hr"),
                    raw_data.get("rpe"),
                    athlete_id,
                    event_link["event_id"],
                    event_link["timezone"],
                    event_link["local_day"],
                ),
            )
            if await cur.fetchone() is None:
                raise LookupError("计划训练不存在")
        await conn.commit()
        return dict(row)
