from __future__ import annotations

from datetime import date, datetime
from typing import Any, cast
from uuid import UUID

from application.data_health_sql import (
    _ACTIVITY_DATA_AS_OF_QUERY,
    _ACTIVITY_HEALTH_QUERY,
    _ATHLETE_TIMEZONE_QUERY,
    _FRESHNESS_QUERY,
    _GAPS_QUERY,
    _STRENGTH_COVERAGE_QUERY,
    _SYNC_STATUS_QUERY,
    _TRAINING_LOAD_HEALTH_QUERY,
    _UNASSIGNED_RUN_QUERY,
    _UPLOAD_COVERAGE_QUERY,
    _WELLNESS_COVERAGE_QUERY,
    _WELLNESS_HEALTH_QUERY,
)

# 与 gear 仓储一致的跑步类运动，未关联跑鞋的活动按这个集合统计。
_RUN_SPORTS = ("Run", "TrailRun", "VirtualRun")


async def compute_data_health(athlete_id: UUID, db_pool_or_conn: Any) -> dict[str, object]:
    connection_factory = getattr(db_pool_or_conn, "connection", None)
    if callable(connection_factory):
        async with connection_factory() as conn, conn.cursor() as cur:
            return await _read_health(cur, athlete_id)

    async with db_pool_or_conn.cursor() as cur:
        return await _read_health(cur, athlete_id)


async def compute_data_freshness(athlete_id: UUID, db_pool_or_conn: Any) -> dict[str, object]:
    """首页 coach-context 只需要数据时点与近 90 天缺口。

    完整健康度诊断还包含覆盖度、力量、上传等统计，这里一条查询取回两个
    data_as_of，避免每次首页加载都跑十余条覆盖度语句。
    """
    connection_factory = getattr(db_pool_or_conn, "connection", None)
    if callable(connection_factory):
        async with connection_factory() as conn, conn.cursor() as cur:
            return await _read_freshness(cur, athlete_id)

    async with db_pool_or_conn.cursor() as cur:
        return await _read_freshness(cur, athlete_id)


async def compute_activity_data_as_of(athlete_id: UUID, db_pool_or_conn: Any) -> datetime | None:
    """集成卡片只展示活动数据时点，单条索引聚合即可。"""
    connection_factory = getattr(db_pool_or_conn, "connection", None)
    if callable(connection_factory):
        async with connection_factory() as conn, conn.cursor() as cur:
            return await _read_activity_data_as_of(cur, athlete_id)

    async with db_pool_or_conn.cursor() as cur:
        return await _read_activity_data_as_of(cur, athlete_id)


async def _read_activity_data_as_of(cur: Any, athlete_id: UUID) -> datetime | None:
    _ = await cur.execute(_ACTIVITY_DATA_AS_OF_QUERY, (athlete_id,))
    return _datetime_value(await cur.fetchone(), "data_as_of")


async def _read_freshness(cur: Any, athlete_id: UUID) -> dict[str, object]:
    _ = await cur.execute(_FRESHNESS_QUERY, (athlete_id, athlete_id))
    freshness_row = await cur.fetchone()
    athlete_timezone = await _athlete_timezone(cur, athlete_id)
    _ = await cur.execute(_GAPS_QUERY, (athlete_timezone, athlete_id, athlete_id))
    gap_rows = await cur.fetchall()
    return {
        "activities": {"data_as_of": _datetime_value(freshness_row, "activity_data_as_of")},
        "wellness": {"data_as_of": _date_value(freshness_row, "wellness_data_as_of")},
        "gaps": [_gap(row) for row in gap_rows],
    }


async def _athlete_timezone(cur: Any, athlete_id: UUID) -> str:
    _ = await cur.execute(_ATHLETE_TIMEZONE_QUERY, (athlete_id,))
    tz_row = await cur.fetchone()
    raw_timezone = tz_row.get("timezone") if tz_row else None
    if isinstance(raw_timezone, (bytes, bytearray)):
        raw_timezone = raw_timezone.decode()
    return str(raw_timezone) if raw_timezone else "UTC"


async def _read_health(cur: Any, athlete_id: UUID) -> dict[str, object]:
    _ = await cur.execute(_ACTIVITY_HEALTH_QUERY, (athlete_id,))
    activity_row = await cur.fetchone()
    _ = await cur.execute(_WELLNESS_HEALTH_QUERY, (athlete_id,))
    wellness_row = await cur.fetchone()
    _ = await cur.execute(_WELLNESS_COVERAGE_QUERY, (athlete_id,))
    coverage_row = await cur.fetchone()
    _ = await cur.execute(_STRENGTH_COVERAGE_QUERY, (athlete_id,))
    strength_row = await cur.fetchone()
    _ = await cur.execute(_UPLOAD_COVERAGE_QUERY, (athlete_id,))
    upload_row = await cur.fetchone()
    _ = await cur.execute(_TRAINING_LOAD_HEALTH_QUERY, (athlete_id,))
    training_load_row = await cur.fetchone()
    athlete_timezone = await _athlete_timezone(cur, athlete_id)
    _ = await cur.execute(_UNASSIGNED_RUN_QUERY, (athlete_id, list(_RUN_SPORTS)))
    unassigned_row = await cur.fetchone()
    _ = await cur.execute(_SYNC_STATUS_QUERY, (athlete_id,))
    sync_row = await cur.fetchone()
    _ = await cur.execute(_GAPS_QUERY, (athlete_timezone, athlete_id, athlete_id))
    gap_rows = await cur.fetchall()

    activities = _activity_health(activity_row)
    wellness = _wellness_health(wellness_row)
    return {
        "activities": activities,
        "wellness": wellness,
        "training_load": {"data_as_of": _date_value(training_load_row, "data_as_of")},
        "completeness": {"activities": _activity_completeness(activities)},
        "coverage": {
            "activities": {
                "total_activities": _int_object(activities["total"]),
                "with_hr": _int_object(activities["with_hr"]),
                "with_gps": _int_object(activities["with_gps"]),
                "with_power": _int_object(activities["with_power"]),
                "with_streams": _int_object(activities["with_streams"]),
                "unassigned_run_activities_30d": _int_value(unassigned_row, "unassigned"),
                "first_at": activities["first_at"],
            },
            "wellness": {
                **_wellness_coverage(coverage_row),
                "first_day": wellness["first_day"],
            },
            "strength": _strength_coverage(strength_row),
            "uploads": _upload_coverage(upload_row),
            "sync": _sync_status(sync_row),
        },
        "gaps": [_gap(row) for row in gap_rows],
    }


def _sync_status(row: dict[str, object] | None) -> dict[str, object]:
    return {
        "last_sync_at": _datetime_value(row, "last_sync_at"),
        "last_sync_status": row.get("last_sync_status") if row else None,
    }


def _activity_health(row: dict[str, object] | None) -> dict[str, object]:
    return {
        "data_as_of": _datetime_value(row, "data_as_of"),
        "first_at": _datetime_value(row, "first_at"),
        "total": _int_value(row, "total"),
        "with_hr": _int_value(row, "with_hr"),
        "with_gps": _int_value(row, "with_gps"),
        "with_power": _int_value(row, "with_power"),
        "with_streams": _int_value(row, "with_streams"),
    }


def _activity_completeness(activities: dict[str, object]) -> dict[str, int]:
    return {
        "with_hr": _int_object(activities["with_hr"]),
        "with_gps": _int_object(activities["with_gps"]),
        "with_power": _int_object(activities["with_power"]),
    }


def _wellness_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "sleep_days_28d": _int_value(row, "sleep_days_28d"),
        "rhr_days_28d": _int_value(row, "rhr_days_28d"),
        "hrv_days_28d": _int_value(row, "hrv_days_28d"),
    }


def _strength_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "sessions_14d": _int_value(row, "sessions_14d"),
        "sessions_total": _int_value(row, "sessions_total"),
    }


def _upload_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "runs_30d": _int_value(row, "runs_30d"),
        "failed_30d": _int_value(row, "failed_30d"),
    }


def _wellness_health(row: dict[str, object] | None) -> dict[str, object]:
    return {
        "data_as_of": _date_value(row, "data_as_of"),
        "first_day": _date_value(row, "first_day"),
        "total_days": _int_value(row, "total_days"),
        "latest_day": _date_value(row, "latest_day"),
    }


def _gap(row: dict[str, date]) -> dict[str, date]:
    return {"from": row["from"], "to": row["to"]}


def _datetime_value(row: dict[str, object] | None, key: str) -> datetime | None:
    if row is None:
        return None
    value = row.get(key)
    return cast(datetime, value) if value is not None else None


def _date_value(row: dict[str, object] | None, key: str) -> date | None:
    if row is None:
        return None
    value = row.get(key)
    return cast(date, value) if value is not None else None


def _int_value(row: dict[str, object] | None, key: str) -> int:
    return _int_object(row.get(key)) if row else 0


def _int_object(value: object) -> int:
    return int(value) if isinstance(value, int | float | str) else 0
