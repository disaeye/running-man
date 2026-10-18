from datetime import date
from uuid import UUID

from domain.time import local_day_sql
from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


# The all-sports series reads stored facts, which ``application/load/pmc_facts``
# writes with the athlete's zone. The sport-filtered series recomputes here, so
# it must use the same zone or the two modes disagree about which day an evening
# run belongs to.


# ``acwr`` is optional: it is absent until a full chronic window of history
# exists (see domain.load.acwr), and the previous ``HAVING COUNT(...) = 5``
# required it, which would drop the athlete's first 28 days from the series
# entirely — turning "we cannot compute this yet" into "these days do not
# exist". The four core metrics are required.
_CURRENT_FACT_QUERY = """
SELECT
    day,
    MAX(value) FILTER (WHERE metric_key = 'ctl') AS ctl,
    MAX(value) FILTER (WHERE metric_key = 'atl') AS atl,
    MAX(value) FILTER (WHERE metric_key = 'tsb') AS tsb,
    MAX(value) FILTER (WHERE metric_key = 'daily_tss') AS tss,
    MAX(value) FILTER (WHERE metric_key = 'acwr') AS acwr
FROM current_daily_facts
WHERE athlete_id = %s
  AND sport IS NULL
  AND day BETWEEN %s AND %s
  AND metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
GROUP BY day
HAVING COUNT(DISTINCT metric_key) FILTER (
    WHERE metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb')
) = 4
ORDER BY day
"""


class PmcRepo:
    async def get_daily_load_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(_CURRENT_FACT_QUERY, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def get_filtered_daily_tss(
        self, athlete_id: UUID, start: date, end: date, sport: str
    ) -> dict[date, float]:
        # The zone comes from the athlete's own profile row in the same
        # statement, so the day key cannot drift from the athlete it belongs to.
        day = local_day_sql("SELECT timezone FROM athletes WHERE id = %s")
        query = f"""
        SELECT {day} AS day, COALESCE(SUM(tss.value), 0) AS tss
        FROM activity_compute AS a
        JOIN current_activity_facts AS tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE a.athlete_id = %s AND a.sport = %s
          AND {day} <= %s
        GROUP BY day
        ORDER BY day
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, athlete_id, sport, athlete_id, end))
            rows = await cur.fetchall()
        return {row["day"]: float(row["tss"]) for row in rows}

    async def total_tss(self, athlete_id: UUID, start: date, end: date) -> float:
        query = """
        SELECT COALESCE(SUM(value), 0) AS tss FROM current_daily_facts
        WHERE athlete_id = %s AND day BETWEEN %s AND %s
          AND sport IS NULL AND metric_key = 'daily_tss'
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, start, end))
            row = await cur.fetchone()
        return float(row["tss"]) if row else 0.0

    async def count_days(self, athlete_id: UUID) -> int:
        query = """
        SELECT COUNT(DISTINCT day) AS days FROM current_daily_facts
        WHERE athlete_id = %s AND sport IS NULL AND metric_key = 'daily_tss'
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            row = await cur.fetchone()
        return int(row["days"]) if row else 0
