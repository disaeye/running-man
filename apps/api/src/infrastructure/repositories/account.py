from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, LiteralString, cast
from uuid import UUID

from fastapi.encoders import jsonable_encoder

from infrastructure.db.pool import ConnectionContext, get_pool
from presentation.api.account_contracts import (
    AccountExportResource,
    AccountExportResourceName,
)
from presentation.api.json_contracts import JsonDocument


@dataclass(frozen=True, slots=True)
class _ExportResourceQuery:
    name: AccountExportResourceName
    table_name: str
    query: LiteralString


_RESOURCE_QUERIES: Final[Sequence[_ExportResourceQuery]] = (
    _ExportResourceQuery(
        AccountExportResourceName.ACTIVITIES,
        "activity_summary",
        "SELECT * FROM activity_summary WHERE athlete_id = %s ORDER BY start_time",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.ACTIVITY_LAPS,
        "activity_laps",
        "SELECT * FROM activity_laps WHERE athlete_id = %s ORDER BY start_time, lap_index",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.CALENDAR_EVENTS,
        "training_calendar",
        "SELECT * FROM training_calendar WHERE athlete_id = %s ORDER BY start_time",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.DERIVED_METRICS,
        "derived_metric_facts",
        "SELECT * FROM derived_metric_facts WHERE athlete_id = %s ORDER BY computed_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.FTP_HISTORY,
        "ftp_history",
        "SELECT * FROM ftp_history WHERE athlete_id = %s ORDER BY effective_from",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.GEAR,
        "gear_shoes",
        "SELECT * FROM gear_shoes WHERE athlete_id = %s ORDER BY created_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.GOALS,
        "goals",
        "SELECT * FROM goals WHERE athlete_id = %s ORDER BY created_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.HEALTH,
        "health_wellness",
        "SELECT * FROM health_wellness WHERE athlete_id = %s ORDER BY day",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.INTEGRATIONS,
        "user_integrations",
        """SELECT id, athlete_id, source, connected, settings, last_sync_at,
                  last_sync_status, last_sync_error, last_sync_detail, created_at, updated_at
           FROM user_integrations WHERE athlete_id = %s ORDER BY source""",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.NOTIFICATIONS,
        "notifications",
        "SELECT * FROM notifications WHERE athlete_id = %s ORDER BY created_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.SHARES,
        "share_tokens",
        "SELECT * FROM share_tokens WHERE athlete_id = %s ORDER BY created_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.STRENGTH,
        "workout_sets",
        "SELECT ws.* FROM workout_sets AS ws WHERE ws.athlete_id = %s "
        "ORDER BY ws.created_at, ws.id",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.SYNC_RUNS,
        "integration_sync_runs",
        "SELECT * FROM integration_sync_runs WHERE athlete_id = %s ORDER BY started_at",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.SESSION_CLASSIFICATIONS,
        "session_classifications",
        "SELECT * FROM session_classifications WHERE athlete_id = %s ORDER BY local_day",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.ACTIVITY_INTERVALS,
        "activity_intervals",
        "SELECT * FROM activity_intervals WHERE athlete_id = %s ORDER BY activity_id",
    ),
    _ExportResourceQuery(
        AccountExportResourceName.WORKOUT_TEMPLATES,
        "workout_templates",
        "SELECT * FROM workout_templates WHERE athlete_id = %s "
        "OR source = 'builtin' ORDER BY goal_type",
    ),
)


def _connect() -> ConnectionContext:
    return get_pool().connection()


class AccountRepo:
    async def delete(self, athlete_id: UUID) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM activity_streams WHERE athlete_id = %s", (athlete_id,)
            )
            _ = await cur.execute("DELETE FROM activity_laps WHERE athlete_id = %s", (athlete_id,))
            _ = await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
            return cur.rowcount > 0

    async def export(self, athlete_id: UUID) -> tuple[JsonDocument, list[AccountExportResource]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT id, email, name, timezone, created_at FROM athletes WHERE id = %s",
                (athlete_id,),
            )
            athlete = await cur.fetchone()
            if athlete is None:
                return None, []
            resources: list[AccountExportResource] = []
            for resource in _RESOURCE_QUERIES:
                _ = await cur.execute(
                    "SELECT to_regclass(%s) IS NOT NULL AS table_exists",
                    (f"public.{resource.table_name}",),
                )
                existence = await cur.fetchone()
                table_exists = (
                    bool(cast(dict[str, object], existence)["table_exists"])
                    if existence is not None
                    else False
                )
                if not table_exists:
                    resources.append(AccountExportResource(name=resource.name, records=[]))
                    continue
                _ = await cur.execute(resource.query, (athlete_id,))
                records = jsonable_encoder([dict(row) for row in await cur.fetchall()])
                resources.append(AccountExportResource(name=resource.name, records=records))
        return jsonable_encoder(dict(athlete)), resources
