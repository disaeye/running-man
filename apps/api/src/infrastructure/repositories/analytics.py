from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID

from domain.time import local_day_sql
from domain.time.partition_bounds import (
    coarse_utc_bounds,
    coarse_utc_bounds_for_activities,
    coarse_utc_bounds_for_instant,
)
from infrastructure.db.pool import ConnectionContext, get_pool

# Day-keyed ranges resolve against the athlete's calendar day, never the
# database session's. Without this an evening Asia/Shanghai run lands on the
# previous day, because the session timezone is UTC.
#
# The zone comes from the athlete's own row inside the same statement, so the
# filter and the day key cannot disagree, and every caller binds one placeholder
# per use. A bare `%s` here left `activities_for_range` with four placeholders
# and three parameters, which returned 500 on every request.
_ACTIVITY_DAY = local_day_sql("SELECT timezone FROM athletes WHERE id = %s", column="a.start_time")

# 分区键的粗边界：本地日表达式无法裁剪分区，补一条更宽的 UTC 边界后规划器
# 只打开相关分区，结果与原先完全一致。
_SUMMARY_BOUNDS = "a.start_time >= %s AND a.start_time < %s"
_STREAM_BOUNDS = "s.sample_time >= %s AND s.sample_time < %s"


def _connect() -> ConnectionContext:
    return get_pool().connection()


class AnalyticsRepo:
    async def activity_streams(
        self, athlete_id: UUID, activity_id: str, start_time: datetime
    ) -> list[dict[str, object]]:
        bounds = coarse_utc_bounds_for_instant(start_time)
        query = """
        SELECT sample_time, metric_type, value, lat, lon, alt FROM activity_streams
        WHERE athlete_id = %s AND activity_id = %s
          AND sample_time >= %s AND sample_time < %s
        ORDER BY sample_time, metric_type LIMIT 100000
        """
        return await self._rows(query, (athlete_id, activity_id, *bounds))

    async def running_activities(self, athlete_id: UUID) -> list[dict[str, object]]:
        query = """
        SELECT activity_id, sport, distance_m, duration_s FROM activity_compute
        WHERE athlete_id = %s AND start_time > NOW() - INTERVAL '730 days' ORDER BY start_time DESC
        """
        return await self._rows(query, (athlete_id,))

    async def activities_for_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        return await self._rows(
            self._activity_statement(f"{_ACTIVITY_DAY} BETWEEN %s AND %s AND {_SUMMARY_BOUNDS}"),
            (athlete_id, athlete_id, start, end, *coarse_utc_bounds(start, end)),
        )

    async def all_activities(
        self, athlete_id: UUID, sport: str | None, history_start: date
    ) -> list[dict[str, object]]:
        # 个人纪录需要全历史，但分区表仍能从最早可能存在的月份开始裁剪。
        # 起点由调用方给出；上界用数据库当前时刻，不依赖宿主机时区。
        condition = (
            "a.sport = %s AND a.start_time >= %s AND a.start_time <= now() + interval '1 day'"
            if sport
            else "a.start_time >= %s AND a.start_time <= now() + interval '1 day'"
        )
        lower, _ = coarse_utc_bounds(history_start, history_start)
        params: tuple[object, ...] = (athlete_id, sport, lower) if sport else (athlete_id, lower)
        return await self._rows(self._activity_statement(condition), params)

    async def streams_for_range(
        self, athlete_id: UUID, start: date, end: date, metric_types: list[str]
    ) -> dict[str, list[dict[str, object]]]:
        start_time = datetime.combine(start, time.min)
        end_time = datetime.combine(end + timedelta(days=1), time.min)
        # 流样本可以比活动结束晚数小时，粗边界的余量由 coarse_utc_bounds 提供。
        stream_bounds = coarse_utc_bounds(start, end)
        query = f"""
        SELECT s.activity_id, s.sample_time, s.metric_type, s.value, s.lat, s.lon, s.alt
        FROM activity_streams s JOIN activity_compute a
          ON a.athlete_id = s.athlete_id AND a.activity_id = s.activity_id
        WHERE s.athlete_id = %s AND a.start_time >= %s AND a.start_time < %s
          AND s.metric_type = ANY(%s) AND {_STREAM_BOUNDS}
        ORDER BY s.activity_id, s.sample_time, s.metric_type
        """
        return _group(
            await self._rows(
                query, (athlete_id, start_time, end_time, metric_types, *stream_bounds)
            )
        )

    async def streams_for_activities(
        self,
        athlete_id: UUID,
        activities: list[dict[str, object]],
        metric_types: list[str] | None = None,
    ) -> dict[str, list[dict[str, object]]]:
        if not activities:
            return {}
        activity_ids = [str(row["activity_id"]) for row in activities]
        lower, upper = coarse_utc_bounds_for_activities(activities)
        filter_sql = "AND metric_type = ANY(%s)" if metric_types else ""
        params: tuple[object, ...] = (
            (athlete_id, activity_ids, metric_types, lower, upper)
            if metric_types
            else (athlete_id, activity_ids, lower, upper)
        )
        query = f"""
        SELECT activity_id, sample_time, metric_type, value, lat, lon, alt FROM activity_streams
        WHERE athlete_id = %s AND activity_id = ANY(%s) {filter_sql}
          AND sample_time >= %s AND sample_time < %s
        ORDER BY sample_time, metric_type
        """
        return _group(await self._rows(query, params))

    async def _rows(self, query: str, params: tuple[object, ...]) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, params)
            return [dict(row) for row in await cur.fetchall()]

    @staticmethod
    def _activity_statement(condition: str) -> str:
        return f"""
        SELECT a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s, a.avg_hr,
               a.max_hr, a.avg_power, np.value AS np, intensity.value AS intensity_factor,
               tss.value AS tss, a.avg_cadence, a.avg_speed, a.elevation_gain_m, a.calories,
               a.external_id, a.source, a.file_type, a.device_name
        FROM activity_compute a
        LEFT JOIN current_activity_facts np
          ON np.athlete_id = a.athlete_id AND np.subject_key = a.activity_id
         AND np.metric_key = 'normalized_power'
        LEFT JOIN current_activity_facts intensity
          ON intensity.athlete_id = a.athlete_id AND intensity.subject_key = a.activity_id
         AND intensity.metric_key = 'intensity_factor'
        LEFT JOIN current_activity_facts tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE a.athlete_id = %s AND {condition} ORDER BY a.start_time
        """


def _group(rows: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        grouped.setdefault(str(row["activity_id"]), []).append(row)
    return grouped
