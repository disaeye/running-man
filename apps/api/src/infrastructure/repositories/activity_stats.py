"""Read-only aggregate stats over activity_summary — kept separate from
ActivityRepo to respect the 250 LOC module cap."""

from datetime import date
from uuid import UUID

from psycopg import sql

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class ActivityStatsRepo:
    async def aggregate_by_sport(
        self,
        athlete_id: UUID,
        start: date | None,
        end: date | None,
        sport: str | None,
    ) -> list[dict[str, object]]:
        """Per-sport aggregate: {sport, total_distance_m, total_duration_s,
        total_tss, activity_count}."""
        # 联表后列名必须带表限定：activity_compute 与 current_activity_facts
        # 都有 athlete_id，裸列名会 AmbiguousColumn。日界表达式镜像
        # domain.time.local_day_sql（子查询括号防 AT TIME ZONE 吞掉 SELECT），
        # 这里写字面量以保持 psycopg 的 LiteralString 类型。
        day = sql.SQL(
            "(a.start_time AT TIME ZONE (SELECT timezone FROM athletes WHERE id = %s))::date"
        )
        conditions: list[sql.Composable] = [sql.SQL("a.athlete_id = %s")]
        params: list[object] = [athlete_id]
        if start is not None:
            conditions.append(day + sql.SQL(" >= %s"))
            params.append(athlete_id)
            params.append(start)
        if end is not None:
            conditions.append(day + sql.SQL(" <= %s"))
            params.append(athlete_id)
            params.append(end)
        if sport is not None:
            conditions.append(sql.SQL("a.sport = %s"))
            params.append(sport)
        query = sql.SQL(
            "SELECT a.sport, "
            "COALESCE(SUM(a.distance_m), 0) AS total_distance_m, "
            "COALESCE(SUM(a.duration_s), 0) AS total_duration_s, "
            "COALESCE(SUM(tss.value), 0) AS total_tss, "
            "COUNT(*) AS activity_count "
            "FROM activity_compute AS a "
            "LEFT JOIN current_activity_facts AS tss "
            "ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id "
            "AND tss.metric_key = 'tss' "
            "WHERE "
        ) + sql.SQL(" AND ").join(conditions) + sql.SQL(
            " GROUP BY a.sport ORDER BY a.sport"
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, tuple(params))
            return [dict(row) for row in await cur.fetchall()]
