from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import UUID

from domain.time.partition_bounds import (
    coarse_utc_bounds,
    coarse_utc_bounds_for_activities,
)
from infrastructure.db.pool import ConnectionContext, get_pool


def _bounds_from(rows: list[dict[str, object]]) -> tuple[datetime, datetime] | None:
    """按活动行的 `start_time` 求流分区的粗边界；没有可用行返回 None。"""
    if not rows:
        return None
    return coarse_utc_bounds_for_activities(rows)


def _connect() -> ConnectionContext:
    return get_pool().connection()


# Day-keyed filters resolve against the athlete's calendar day. The zone is
# read from the athlete's own profile in the same statement, so the filter and
# the day key can never disagree about which athlete the day belongs to.
#
# The expression appears verbatim in each statement: it is a fixed template
# with its only variable part bound as a parameter, so no statement is built by
# string interpolation.
_CALENDAR_DAY_SQL = "(start_time AT TIME ZONE (SELECT timezone FROM athletes WHERE id = %s))::date"

# 分区表按 UTC 时刻分区，本地日表达式无法让规划器裁剪分区。补一条更宽的
# 分区键边界，结果集不变，规划器只打开覆盖该日期区间的分区。
_STREAM_BOUNDS = "sample_time >= %s AND sample_time < %s"


class InsightReadRepo:
    async def events_for_day(self, athlete_id: UUID, target_day: date) -> list[dict[str, object]]:
        return await self.planned_events(athlete_id, target_day, target_day)

    async def planned_events(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                SELECT event_id, start_time, category, sport_type, name, predicted_tss,
                       status, done, plan_goal_id, plan_source, training_type,
                       workout_prescription, athlete_edited, linked_activity_id,
                       completed_distance_m, completed_duration_s, completed_avg_hr,
                       completed_rpe, actual_logged_at, predicted_distance_m
                FROM training_calendar
                WHERE athlete_id = %s
                  AND (start_time AT TIME ZONE (
                           SELECT timezone FROM athletes WHERE id = %s))::date
                      BETWEEN %s AND %s
                  AND status <> 'deleted'
                ORDER BY start_time
                """,
                (athlete_id, athlete_id, start, end),
            )
            return [dict(row) for row in await cur.fetchall()]

    async def week_context(
        self, athlete_id: UUID, start: date, end: date, target_day: date
    ) -> tuple[float, int]:
        recent_start = target_day - timedelta(days=6)
        recent_bounds = coarse_utc_bounds(recent_start, target_day)
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                SELECT COALESCE(SUM(predicted_tss), 0) AS value FROM training_calendar
                WHERE athlete_id = %s
                  AND (start_time AT TIME ZONE (
                           SELECT timezone FROM athletes WHERE id = %s))::date
                      BETWEEN %s AND %s
                  AND status <> 'deleted'
                """,
                (athlete_id, athlete_id, start, end),
            )
            planned_row = await cur.fetchone()
            _ = await cur.execute(
                """
                SELECT COUNT(DISTINCT (start_time AT TIME ZONE (
                           SELECT timezone FROM athletes WHERE id = %s))::date) AS value
                FROM activity_compute
                WHERE athlete_id = %s
                  AND (start_time AT TIME ZONE (
                           SELECT timezone FROM athletes WHERE id = %s))::date
                      BETWEEN %s AND %s
                  AND start_time >= %s AND start_time < %s
                """,
                (
                    athlete_id,
                    athlete_id,
                    athlete_id,
                    recent_start,
                    target_day,
                    *recent_bounds,
                ),
            )
            recent_row = await cur.fetchone()
        return float(planned_row["value"] if planned_row else 0), int(
            recent_row["value"] if recent_row else 0
        )

    async def streams(
        self,
        athlete_id: UUID,
        activities: list[dict[str, object]],
        metric_types: list[str] | None = None,
    ) -> dict[str, list[dict[str, object]]]:
        bounds = _bounds_from(activities)
        if bounds is None:
            return {}
        activity_ids = [str(row["activity_id"]) for row in activities]
        # 心率分布、功率曲线这类读者只要一种 metric；不传过滤会把定位、海拔、
        # 配速全部拉回来，一次请求就多出十几万行。
        columns = (
            "activity_id, metric_type, value"
            if metric_types
            else "activity_id, sample_time, metric_type, value, lat, lon, alt"
        )
        metric_filter = "AND metric_type = ANY(%s)" if metric_types else ""
        params: tuple[object, ...] = (
            (athlete_id, activity_ids, metric_types, *bounds)
            if metric_types
            else (athlete_id, activity_ids, *bounds)
        )
        query = f"""
        SELECT {columns} FROM activity_streams
        WHERE athlete_id = %s AND activity_id = ANY(%s) {metric_filter}
          AND {_STREAM_BOUNDS}
        ORDER BY sample_time, metric_type
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, params)
            rows = [dict(row) for row in await cur.fetchall()]
        grouped: dict[str, list[dict[str, object]]] = {}
        for row in rows:
            grouped.setdefault(str(row["activity_id"]), []).append(row)
        return grouped

    async def metric_value_counts(
        self, athlete_id: UUID, activities: list[dict[str, object]], metric_types: list[str]
    ) -> dict[str, dict[int, int]]:
        """按（活动, 数值）计数：分桶只需要每个值出现几次。

        逐样本取回几万行再在 Python 里计数，与在数据库里 GROUP BY 的结果
        完全一致（下游就是每个值乘以统一的每样本次时长），传输量只有几十
        分之一。
        """
        bounds = _bounds_from(activities)
        if bounds is None:
            return {}
        activity_ids = [str(row["activity_id"]) for row in activities]
        query = f"""
        SELECT activity_id, value::int AS value, count(*) AS n FROM activity_streams
        WHERE athlete_id = %s AND activity_id = ANY(%s) AND metric_type = ANY(%s)
          AND {_STREAM_BOUNDS}
        GROUP BY activity_id, value::int
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_ids, metric_types, *bounds))
            rows = await cur.fetchall()
        grouped: dict[str, dict[int, int]] = {}
        for row in rows:
            grouped.setdefault(str(row["activity_id"]), {})[int(row["value"])] = int(row["n"])
        return grouped
