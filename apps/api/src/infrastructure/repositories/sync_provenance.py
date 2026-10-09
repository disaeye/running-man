from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import date
from uuid import UUID

import psycopg

from domain.ingestion import RejectedSourceRecord


def start_sync_run(
    conn: psycopg.Connection,
    athlete_id: int | str,
    source: str,
    window_start: date,
    window_end: date,
) -> UUID | None:
    if not _tables_exist(conn, "integration_sync_runs"):
        return None
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            INSERT INTO integration_sync_runs (
                athlete_id, source, trigger, window_start, window_end, status
            ) VALUES (%s, %s, 'adapter', %s, %s, 'running')
            RETURNING id
            """,
            (athlete_id, source, window_start, window_end),
        )
        row = cur.fetchone()
    return row[0] if row else None


def finish_sync_run(
    conn: psycopg.Connection,
    sync_run_id: UUID | None,
    *,
    status: str,
    activities_seen: int,
    activities_upserted: int,
    activities_deduplicated: int,
    errors_count: int,
) -> None:
    if sync_run_id is None:
        return
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            UPDATE integration_sync_runs
            SET finished_at = now(), status = %s, activities_seen = %s,
                activities_upserted = %s, activities_deduplicated = %s,
                errors_count = %s
            WHERE id = %s
            """,
            (
                status,
                activities_seen,
                activities_upserted,
                activities_deduplicated,
                errors_count,
                sync_run_id,
            ),
        )


def record_rejection(
    conn: psycopg.Connection,
    athlete_id: int | str,
    sync_run_id: UUID | None,
    rejection: RejectedSourceRecord,
) -> bool:
    if not _tables_exist(conn, "source_records"):
        return False
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            INSERT INTO source_records (
                athlete_id, source, entity_type, source_record_id, raw_payload,
                payload_hash, sync_run_id, status
            ) VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)
            """,
            (
                athlete_id,
                rejection.source,
                rejection.entity_type,
                rejection.source_record_id,
                _json(rejection.raw_payload),
                _payload_hash(rejection.raw_payload),
                sync_run_id,
                rejection.status,
            ),
        )
        if sync_run_id is not None and _tables_exist(conn, "integration_sync_errors"):
            _ = cur.execute(
                """
                INSERT INTO integration_sync_errors (
                    sync_run_id, athlete_id, source, entity_type, source_record_id,
                    activity_id, error_code, message, retryable
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, false)
                """,
                (
                    sync_run_id,
                    athlete_id,
                    rejection.source,
                    rejection.entity_type,
                    rejection.source_record_id,
                    rejection.activity_id,
                    rejection.error_code,
                    rejection.message,
                ),
            )
    return True


def primary_activity_source(conn: psycopg.Connection, athlete_id: int | str) -> str | None:
    if not _tables_exist(conn, "user_integrations"):
        return None
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            SELECT source FROM user_integrations
            WHERE athlete_id = %s
              AND connected IS TRUE
              AND settings->>'primary_activity_source' = 'true'
            ORDER BY source
            LIMIT 1
            """,
            (athlete_id,),
        )
        row = cur.fetchone()
    return _text(row[0]) if row else None


def secondary_duplicate_exists(
    conn: psycopg.Connection,
    athlete_id: int | str,
    source: str,
    source_hash: str | None,
) -> bool:
    if source_hash is None:
        return False
    primary_source = primary_activity_source(conn, athlete_id)
    if primary_source is None or primary_source == source:
        return False
    if not _tables_exist(conn, "activity_summary"):
        return False
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            SELECT 1 FROM activity_summary
            WHERE athlete_id = %s AND source = %s AND source_hash = %s
            LIMIT 1
            """,
            (athlete_id, primary_source, source_hash),
        )
        return cur.fetchone() is not None


def _json(payload: Mapping[str, object]) -> str:
    return json.dumps(dict(payload), ensure_ascii=True, sort_keys=True, default=str)


def _payload_hash(payload: Mapping[str, object]) -> str:
    return hashlib.sha256(_json(payload).encode()).hexdigest()


def _text(value: object) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def _tables_exist(conn: psycopg.Connection, *names: str) -> bool:
    with conn.cursor() as cur:
        for name in names:
            _ = cur.execute("SELECT to_regclass(%s)", (name,))
            row = cur.fetchone()
            if row is None or row[0] is None:
                return False
    return True
