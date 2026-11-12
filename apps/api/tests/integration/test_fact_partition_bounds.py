"""迁移里的日期事实函数必须与当前函数返回完全相同的结果集。"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import psycopg

from infrastructure.db.migration_sql.fact_partition_bounds_sql import (
    DAILY_FACTS_WITH_BOUNDS,
    DAILY_FACTS_WITHOUT_BOUNDS,
)

_SELECT = (
    "SELECT day, sport, metric_key, unit, value, algorithm_version, computed_at "
    "FROM get_athlete_daily_facts(%s, %s, %s) "
    "ORDER BY day, sport NULLS FIRST, metric_key, unit"
)


def test_bounded_daily_facts_match_unbounded(db_conn: psycopg.Connection) -> None:
    """四个时区、三个日期区间逐行比较；事务回滚后数据库函数保持原状。"""
    athlete_id = uuid4()
    run_id = uuid4()
    with db_conn.cursor() as cur:
        cur.execute("SAVEPOINT fact_bounds")
        try:
            _seed(cur, athlete_id, run_id)
            cases = [
                (date(2026, 7, 15), date(2026, 7, 15)),
                (date(2026, 7, 14), date(2026, 7, 16)),
                (date(2026, 1, 1), date(2026, 11, 4)),
            ]
            zones = ("UTC", "Asia/Shanghai", "Pacific/Kiritimati", "Etc/GMT+12")

            cur.execute(DAILY_FACTS_WITHOUT_BOUNDS)
            baseline = {
                (zone, start, end): _rows(cur, zone, athlete_id, start, end)
                for zone in zones
                for start, end in cases
            }

            cur.execute(DAILY_FACTS_WITH_BOUNDS)
            bounded = {
                (zone, start, end): _rows(cur, zone, athlete_id, start, end)
                for zone in zones
                for start, end in cases
            }

            cur.execute(
                "SELECT prosrc FROM pg_proc p JOIN pg_namespace n "
                "ON n.oid = p.pronamespace "
                "WHERE n.nspname = 'public' AND p.proname = 'get_athlete_daily_facts'"
            )
            body = cur.fetchone()[0]
        finally:
            cur.execute("ROLLBACK TO SAVEPOINT fact_bounds")
            cur.execute("RELEASE SAVEPOINT fact_bounds")

    assert bounded == baseline
    assert any(baseline.values()), "fixture must produce fact rows"
    assert body.count("AT TIME ZONE 'UTC'") == 4


def _rows(
    cur: psycopg.Cursor, zone: str, athlete_id: UUID, start: date, end: date
) -> list[tuple[object, ...]]:
    cur.execute(f"SET TIME ZONE '{zone}'")
    cur.execute(_SELECT, (athlete_id, start, end))
    return [tuple(row) for row in cur.fetchall()]


def _seed(cur: psycopg.Cursor, athlete_id: UUID, run_id: UUID) -> None:
    """在测试库当前表结构上插入会走两条 activity_compute 分支的数据。"""
    cur.execute(
        "INSERT INTO athletes (id, email, password_hash, timezone) "
        "VALUES (%s, %s, 'hash', 'UTC') ON CONFLICT (id) DO UPDATE SET timezone = 'UTC'",
        (athlete_id, f"fact-bounds-{athlete_id}@example.test"),
    )
    cur.execute(
        "UPDATE activity_summary SET start_time = %s, sport = 'run', distance_m = 5000, "
        "duration_s = 1800, avg_hr = 145, source_training_load = 42, athlete_id = %s "
        "WHERE activity_id = 'verify-pace'",
        (datetime(2026, 7, 15, 22, 30, tzinfo=UTC), athlete_id),
    )
    cur.execute(
        "INSERT INTO computation_runs "
        "(id, athlete_id, computation_kind, algorithm_version, input_fingerprint, trigger) "
        "VALUES (%s, %s, 'fact-bounds-test', '1.0.0', %s, 'test') ON CONFLICT DO NOTHING",
        (run_id, athlete_id, "0" * 64),
    )
    cur.execute(
        "INSERT INTO derived_metric_facts "
        "(athlete_id, subject_type, subject_key, metric_key, unit, value, effective_at, "
        " algorithm_version, computation_run_id, method) "
        "VALUES (%s, 'activity', 'verify-pace', 'tss', 'points', 60, %s, '1.0.0', %s, 'test'), "
        "(%s, 'day', %s, 'daily_tss', 'points', 30, %s, '1.0.0', %s, 'test')",
        (
            athlete_id,
            datetime(2026, 7, 15, 22, 30, tzinfo=UTC),
            run_id,
            athlete_id,
            date(2026, 7, 15),
            datetime(2026, 7, 15, tzinfo=UTC),
            run_id,
        ),
    )
    cur.execute(
        "INSERT INTO health_wellness (day, athlete_id, resting_hr, sleep_secs, steps) "
        "VALUES (%s, %s, 55, 28800, 9000) ON CONFLICT DO NOTHING",
        (date(2026, 7, 15), athlete_id),
    )
