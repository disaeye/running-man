from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta

import psycopg

from domain.ingestion import canonical_stream, canonical_stream_metric


def bulk_insert(
    conn: psycopg.Connection,
    athlete_id: int | str,
    activity_id: str,
    streams: list[dict[str, object]],
) -> int:
    params = [_stream_params(athlete_id, activity_id, stream) for stream in streams]
    with conn.cursor() as cur:
        _ = cur.execute(
            "DELETE FROM activity_streams WHERE athlete_id = %s AND activity_id = %s",
            (athlete_id, activity_id),
        )
        if not params:
            return 0
        cur.executemany(_INSERT_SQL, params)
        return len(params)


def has_streams(conn: psycopg.Connection, activity_id: str) -> bool:
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT COUNT(*) FROM activity_streams WHERE activity_id = %s", (activity_id,)
        )
        row = cur.fetchone()
    return bool(row and row[0])


def count_streams(conn: psycopg.Connection, athlete_id: int | str) -> int:
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT COUNT(*) FROM activity_streams WHERE athlete_id = %s", (athlete_id,)
        )
        row = cur.fetchone()
    return int(row[0]) if row else 0


def expand_streams(
    start_time: datetime, streams: Sequence[dict[str, object] | object]
) -> list[dict[str, object]]:
    typed = [stream for stream in streams if isinstance(stream, dict)]
    raw_data_by_type = {_raw_stream_type(stream): _stream_data(stream) for stream in typed}
    rates = [_sample_rate(stream) for stream in typed]
    sample_rate = rates[0] if rates else 1.0
    rows: list[dict[str, object]] = []
    for stream in typed:
        raw_type = _raw_stream_type(stream)
        if raw_type in {"lat", "lon", "time"}:
            continue
        metric_type = canonical_stream_metric(raw_type)
        values = _stream_data(stream)
        for index, value in enumerate(values):
            if not isinstance(value, int | float):
                continue
            rows.append(
                {
                    "sample_time": start_time + timedelta(seconds=index * sample_rate),
                    "metric_type": metric_type,
                    "value": float(value),
                    "lat": _number_at(raw_data_by_type.get("lat"), index),
                    "lon": _number_at(raw_data_by_type.get("lon"), index),
                    "alt": _number_at(raw_data_by_type.get("altitude"), index),
                }
            )
    return rows


def _stream_params(
    athlete_id: int | str, activity_id: str, stream: dict[str, object]
) -> tuple[object, ...]:
    canonical = canonical_stream(stream)
    return (
        canonical["sample_time"],
        activity_id,
        athlete_id,
        canonical["metric_type"],
        canonical["value"],
        canonical.get("lat"),
        canonical.get("lon"),
        canonical.get("alt"),
    )


def _raw_stream_type(stream: dict[str, object]) -> str:
    return str(stream.get("type") or "unknown")


def _stream_data(stream: dict[str, object]) -> Sequence[object]:
    data = stream.get("data")
    return data if isinstance(data, list) else []


def _sample_rate(stream: dict[str, object]) -> float:
    value = stream.get("sample_rate")
    return float(value) if isinstance(value, int | float) and value > 0 else 1.0


def _number_at(values: Sequence[object] | None, index: int) -> float | None:
    if values is None or index >= len(values):
        return None
    value = values[index]
    return float(value) if isinstance(value, int | float) else None


_INSERT_SQL = """
INSERT INTO activity_streams
    (sample_time, activity_id, athlete_id, metric_type, value, lat, lon, alt)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""
