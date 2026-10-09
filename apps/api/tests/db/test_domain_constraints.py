from datetime import UTC, datetime
from uuid import UUID, uuid4

import psycopg
import pytest
from psycopg import errors


def test_canonical_valid_fixtures_insert_successfully(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with db_conn.transaction(force_rollback=True):
        with db_conn.cursor() as cur:
            _ensure_wellness_partition(cur)
            _seed_athlete(cur, athlete_id)
            _insert_activity(cur, athlete_id, "run-ok", "run", "intervals_icu", 5140.0)
            # Not "strava": Strava support was removed and the source registry no
            # longer lists it, so the row violated the foreign key to
            # source_definitions. A brand-new database never had it — the removal
            # migration is what deleted the seed — so only a database carried
            # over from before still held the row, and this fixture was the last
            # thing depending on it.
            _insert_activity(cur, athlete_id, "ride-ok", "ride", "fit", 25000.0)
            _insert_activity(cur, athlete_id, "workout-ok", "workout", "manual", 0.0)
            _insert_wellness(cur, athlete_id)
            _insert_strength_set(cur, athlete_id)


def test_negative_distance_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises(errors.CheckViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                _seed_athlete(cur, athlete_id)
                _insert_activity(cur, athlete_id, "bad-distance", "run", "manual", -1.0)


def test_invalid_source_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises(errors.ForeignKeyViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                _seed_athlete(cur, athlete_id)
                _insert_activity(cur, athlete_id, "bad-source", "run", "intervals.icu", 1.0)


def test_invalid_metric_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises((errors.CheckViolation, errors.ForeignKeyViolation)):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                _seed_athlete(cur, athlete_id)
                _insert_stream(cur, athlete_id, metric_type="heartrate")


def test_invalid_latitude_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises(errors.CheckViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                _seed_athlete(cur, athlete_id)
                _insert_stream(cur, athlete_id, lat=91.0)


def test_duplicate_stream_identity_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises(errors.UniqueViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                _seed_athlete(cur, athlete_id)
                _insert_stream(cur, athlete_id)
                _insert_stream(cur, athlete_id)


def test_invalid_hr_and_rpe_rejected(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with db_conn.transaction(force_rollback=True):
        with db_conn.cursor() as cur:
            _seed_athlete(cur, athlete_id)
            with pytest.raises(errors.CheckViolation):
                with db_conn.transaction(force_rollback=True):
                    _insert_activity(cur, athlete_id, "bad-hr", "run", "manual", 1.0, avg_hr=300)
            with pytest.raises(errors.CheckViolation):
                with db_conn.transaction(force_rollback=True):
                    _insert_strength_set(cur, athlete_id, rpe=11.0)


def test_mismatched_metric_unit_rejected(db_conn: psycopg.Connection) -> None:
    with pytest.raises(errors.ForeignKeyViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                athlete_id = uuid4()
                run_id = _seed_computation_run(cur, athlete_id)
                _insert_fact(cur, athlete_id, run_id, unit="bpm")


def test_definition_fk_delete_behavior_is_restricted(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with db_conn.transaction(force_rollback=True):
        with db_conn.cursor() as cur:
            _seed_athlete(cur, athlete_id)
            _insert_activity(cur, athlete_id, "fk-activity", "run", "manual", 1.0)
            _insert_stream(cur, athlete_id)
            with pytest.raises(errors.ForeignKeyViolation):
                with db_conn.transaction(force_rollback=True):
                    cur.execute("DELETE FROM source_definitions WHERE source_key = 'manual'")
            with pytest.raises(errors.ForeignKeyViolation):
                with db_conn.transaction(force_rollback=True):
                    cur.execute(
                        "DELETE FROM stream_metric_definitions WHERE metric_key = 'heart_rate'"
                    )


def _seed_athlete(cur: psycopg.Cursor, athlete_id: UUID) -> None:
    cur.execute(
        """
        INSERT INTO athletes (id, email, password_hash)
        VALUES (%s, %s, 'hash')
        ON CONFLICT (id) DO NOTHING
        """,
        (athlete_id, f"constraints-{athlete_id}@example.test"),
    )


def _insert_activity(
    cur: psycopg.Cursor,
    athlete_id: UUID,
    activity_id: str,
    sport: str,
    source: str,
    distance_m: float,
    avg_hr: int = 140,
) -> None:
    cur.execute(
        """
        INSERT INTO activity_summary (
            activity_id, athlete_id, start_time, sport, source, distance_m,
            duration_s, avg_hr, max_hr, avg_power, source_weighted_power_w,
            source_training_load
        ) VALUES (%s, %s, %s, %s, %s, %s, 1800, %s, 180, 220, 230, 55)
        """,
        (activity_id, athlete_id, datetime(2026, 7, 15, tzinfo=UTC), sport, source, distance_m, avg_hr),
    )


def _insert_wellness(cur: psycopg.Cursor, athlete_id: UUID) -> None:
    cur.execute(
        """
        INSERT INTO health_wellness (
            day, athlete_id, weight, resting_hr, hrv, sleep_secs, sleep_score,
            fatigue, soreness, stress, mood, motivation, readiness
        ) VALUES ('2026-07-15', %s, 70, 50, 65, 28800, 90, 10, 5, 15, 80, 75, 88)
        """,
        (athlete_id,),
    )


def _ensure_wellness_partition(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS health_wellness_2026_07
        PARTITION OF health_wellness FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')
        """
    )


def _insert_stream(
    cur: psycopg.Cursor,
    athlete_id: UUID,
    metric_type: str = "heart_rate",
    lat: float = 45.0,
) -> None:
    cur.execute(
        """
        INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value, lat, lon)
        VALUES (%s, 'stream-activity', %s, %s, 140, %s, 120)
        """,
        (datetime(2026, 7, 15, 0, 1, tzinfo=UTC), athlete_id, metric_type, lat),
    )


def _insert_strength_set(
    cur: psycopg.Cursor, athlete_id: UUID, rpe: float = 8.0
) -> None:
    _seed_exercise(cur)
    cur.execute("SELECT id FROM exercise_library ORDER BY id LIMIT 1")
    exercise_id = cur.fetchone()[0]
    cur.execute(
        """
        INSERT INTO workout_exercises (activity_id, athlete_id, exercise_id)
        VALUES ('workout-ok', %s, %s)
        RETURNING id
        """,
        (athlete_id, exercise_id),
    )
    workout_exercise_id = cur.fetchone()[0]
    cur.execute(
        """
        INSERT INTO workout_sets (workout_exercise_id, athlete_id, set_number, weight_kg, reps, rpe)
        VALUES (%s, %s, 1, 0, 1, %s)
        """,
        (workout_exercise_id, athlete_id, rpe),
    )


def _seed_exercise(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        INSERT INTO exercise_library (name_cn, name_en, category, primary_muscles)
        VALUES ('squat', 'Constraint Squat', 'legs', ARRAY['quads'])
        ON CONFLICT (name_en) DO NOTHING
        """
    )


def _seed_computation_run(cur: psycopg.Cursor, athlete_id: UUID) -> UUID:
    _seed_athlete(cur, athlete_id)
    run_id = uuid4()
    cur.execute(
        """
        INSERT INTO computation_runs (
            id, athlete_id, computation_kind, algorithm_version, input_fingerprint,
            trigger, status, finished_at
        ) VALUES (%s, %s, 'pmc', '1.0.0', %s, 'manual', 'success', %s)
        """,
        (run_id, athlete_id, "c" * 64, datetime.now(UTC)),
    )
    return run_id


def _insert_fact(cur: psycopg.Cursor, athlete_id: UUID, run_id: UUID, unit: str) -> None:
    cur.execute(
        """
        INSERT INTO derived_metric_facts (
            athlete_id, subject_type, subject_key, metric_key, unit, value,
            effective_at, algorithm_version, computation_run_id, method
        ) VALUES (%s, 'day', '2026-07-15', 'ctl', %s, 42, %s, '1.0.0', %s, 'pmc')
        """,
        (athlete_id, unit, datetime(2026, 7, 15, tzinfo=UTC), run_id),
    )
