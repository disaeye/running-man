from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final

PARTITIONED_TABLES: Final = ("health_wellness", "activity_summary", "activity_streams")
PG_CRON_JOBS: Final = (
    "running-man-create-partitions",
    "create_future_partitions",
    "refresh_daily_load",
    "refresh_weekly_distance",
    "refresh_hr_zones",
)


@dataclass(frozen=True, slots=True)
class PartitionObject:
    table_name: str
    partition_name: str
    month_start: date
    month_stop: date

    @property
    def ddl(self) -> str:
        return (
            f"CREATE TABLE IF NOT EXISTS {self.partition_name} "
            f"PARTITION OF {self.table_name} "
            f"FOR VALUES FROM ('{self.month_start.isoformat()}') "
            f"TO ('{self.month_stop.isoformat()}')"
        )


EXISTING_PARTITIONS_SQL: Final = """
SELECT child.relname
FROM pg_inherits
JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
JOIN pg_class child ON child.oid = pg_inherits.inhrelid
WHERE parent.relname = ANY(%s)
"""

CATALOG_PARTITIONS_SQL: Final = """
SELECT parent.relname AS table_name,
       child.relname AS partition_name,
       pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits
JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
JOIN pg_class child ON child.oid = pg_inherits.inhrelid
WHERE parent.relname = 'activity_streams'
  AND child.relname LIKE 'activity_streams_%'
ORDER BY child.relname
"""

PG_CRON_EXTENSION_SQL: Final = (
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')"
)

PG_CRON_JOBS_SQL: Final = """
SELECT jobname
FROM cron.job
WHERE jobname = ANY(%s)
ORDER BY jobname
"""

UNSCHEDULE_PG_CRON_JOB_SQL: Final = "SELECT cron.unschedule(jobname := %s)"

STALE_AUDIT_SQL: Final = """
SELECT 'derived_metric_facts' AS computation,
       athlete_id::text AS athlete_id,
       max(effective_at)::date::text AS data_as_of
FROM derived_metric_facts
WHERE metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
GROUP BY athlete_id
HAVING max(effective_at)::date < current_date - INTERVAL '3 days'
UNION ALL
SELECT 'physiology' AS computation,
       id::text AS athlete_id,
       physiology_updated_at::text AS data_as_of
FROM athletes
WHERE physiology_updated_at IS NULL
   OR physiology_updated_at < now() - INTERVAL '7 days'
ORDER BY computation, athlete_id
"""

STALE_RECOMPUTE_SQL: Final = """
SELECT DISTINCT athlete_id
FROM (
    SELECT athlete_id
    FROM derived_metric_facts
    WHERE metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
    GROUP BY athlete_id
    HAVING max(effective_at)::date < current_date - INTERVAL '3 days'
    UNION ALL
    SELECT id AS athlete_id
    FROM athletes
    WHERE physiology_updated_at IS NULL
       OR physiology_updated_at < now() - INTERVAL '7 days'
) stale
ORDER BY athlete_id
"""
