from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

import psycopg

from domain.ingestion import IngestionError, RejectedSourceRecord
from infrastructure.repositories.activity_sql import compute_source_hash
from infrastructure.repositories.sync_provenance import record_rejection


def record_activity_rejection(
    db_conn: psycopg.Connection,
    athlete_id: int | str,
    sync_run_id: UUID | None,
    activity: Mapping[str, object],
    error: IngestionError,
) -> int:
    source_record_id = str(activity.get("id") or error.source_record_id or "unknown")
    persisted = record_rejection(
        db_conn,
        athlete_id,
        sync_run_id,
        RejectedSourceRecord(
            source="intervals_icu",
            entity_type="activity",
            source_record_id=source_record_id,
            raw_payload=activity,
            error_code=error.error_code,
            message=error.message,
        ),
    )
    return 1 if persisted else 0


def record_secondary_duplicate(
    db_conn: psycopg.Connection,
    athlete_id: int | str,
    sync_run_id: UUID | None,
    activity: Mapping[str, object],
    activity_id: str,
) -> int:
    distance = activity.get("icu_distance", activity.get("distance"))
    start_time = str(activity.get("start_date") or activity.get("start_date_local"))
    message = "secondary activity source duplicate rejected"
    source_hash = compute_source_hash(str(athlete_id), start_time, _float_or_none(distance))
    source_record_id = str(activity.get("id") or activity_id)
    persisted = record_rejection(
        db_conn,
        athlete_id,
        sync_run_id,
        RejectedSourceRecord(
            source="intervals_icu",
            entity_type="activity",
            source_record_id=source_record_id,
            raw_payload=activity,
            error_code="secondary_source_duplicate",
            message=f"{message}: {source_hash}",
            activity_id=activity_id,
        ),
    )
    return 1 if persisted else 0


def _float_or_none(value: object) -> float | None:
    return float(value) if isinstance(value, int | float | str) and value != "" else None
