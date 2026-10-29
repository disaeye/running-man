"""从 Intervals.icu 获取 FIT 流并保存活动分段和训练效益。"""

from __future__ import annotations

from collections.abc import Sequence

import psycopg

from infrastructure.integrations.intervals.sync_helpers import (
    fit_samples_to_stream_rows,
)
from infrastructure.integrations.intervals.sync_laps import upsert_laps_sync
from infrastructure.integrations.intervals.sync_types import (
    ActivityFitClient,
    StreamProgress,
    StreamSyncError,
    StreamSyncResult,
)
from infrastructure.parsing.fit_parser import parse_fit
from infrastructure.repositories.activity_streams import bulk_insert, has_streams
from infrastructure.repositories.training_effects import persist_training_effects


async def sync_activity_streams(
    athlete_id: int | str,
    client: ActivityFitClient,
    conn: psycopg.Connection,
    activity_ids: Sequence[str],
    force: bool = False,
    on_progress: StreamProgress | None = None,
) -> StreamSyncResult:
    """下载每场活动的 FIT 流，写入采样点、分段与设备训练效益。"""
    inserted = 0
    errors: list[StreamSyncError] = []
    for activity_id in activity_ids:
        if not force and has_streams(conn, activity_id):
            if on_progress is not None:
                on_progress(activity_id, 0)
            continue
        try:
            fit_bytes = await client.download_fit(activity_id)
            result = parse_fit(fit_bytes)
            if not result.samples:
                continue
            rows = fit_samples_to_stream_rows(result.samples)
            activity_inserted = bulk_insert(conn, athlete_id, activity_id, rows)
            inserted += activity_inserted
            upsert_laps_sync(conn, athlete_id, activity_id, result.laps)
            persist_training_effects(conn, athlete_id, activity_id, result.session)
            if on_progress is not None:
                on_progress(activity_id, activity_inserted)
        except Exception as error:
            errors.append(StreamSyncError(activity_id=activity_id, message=str(error)))
            continue
    return StreamSyncResult(inserted=inserted, errors=tuple(errors))
