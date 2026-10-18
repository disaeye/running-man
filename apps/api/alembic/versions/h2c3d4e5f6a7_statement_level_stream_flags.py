"""Refresh the activity stream flags once per statement, not once per row.

``f7a8b9c0d1e2`` added a row-level trigger on ``activity_streams`` that recomputes
``activity_summary``'s stream flags. The body counts the activity's stream rows
and writes the summary row, so inserting n rows for one activity performs n
aggregate scans over a set that grows to n and n row rewrites: O(n^2).

One recorded activity carries 22 369 stream samples. Loading them took 183
seconds in the test suite, and the same path runs on every sync: the first real
import of a few hundred activities would not finish.

The replacement is a statement-level trigger. PostgreSQL 14 and later let a
statement trigger read the affected rows through a transition table, including
when the rows route into partitions of a partitioned parent. The body now walks
the distinct (athlete, activity) pairs the statement touched — normally one —
and refreshes each once.
"""

from alembic import op

revision = "h2c3d4e5f6a7"
down_revision = "h1b2c3d4e5f6"
branch_labels = None
depends_on = None

_STATEMENT_FUNCTION = """
CREATE OR REPLACE FUNCTION refresh_activity_stream_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    target_athlete uuid;
    target_activity text;
    affected_sql text;
BEGIN
    affected_sql := CASE TG_OP
        WHEN 'DELETE' THEN 'SELECT DISTINCT athlete_id, activity_id FROM old_streams'
        ELSE 'SELECT DISTINCT athlete_id, activity_id FROM new_streams'
    END;

    FOR target_athlete, target_activity IN EXECUTE affected_sql LOOP
        UPDATE activity_summary AS a SET
            has_gps = COALESCE(s.has_coords, false),
            has_streams = COALESCE(s.stream_count, 0) > 0,
            stream_sample_count = COALESCE(s.stream_count, 0),
            streams_synced_at = CASE
                WHEN COALESCE(s.stream_count, 0) > 0 THEN now()
                ELSE a.streams_synced_at
            END
        FROM (
            SELECT
                COUNT(*) AS stream_count,
                BOOL_OR(lat IS NOT NULL AND lon IS NOT NULL) AS has_coords
            FROM activity_streams
            WHERE athlete_id = target_athlete AND activity_id = target_activity
        ) AS s
        WHERE a.athlete_id = target_athlete AND a.activity_id = target_activity;
    END LOOP;

    RETURN NULL;
END $function$
"""

# The body from f7a8b9c0d1e2, kept so the downgrade restores the previous state.
_ROW_FUNCTION = """
CREATE OR REPLACE FUNCTION refresh_activity_stream_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    target_athlete uuid;
    target_activity text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_athlete := OLD.athlete_id;
        target_activity := OLD.activity_id;
    ELSE
        target_athlete := NEW.athlete_id;
        target_activity := NEW.activity_id;
    END IF;

    UPDATE activity_summary AS a SET
        has_gps = COALESCE(s.has_coords, false),
        has_streams = COALESCE(s.stream_count, 0) > 0,
        stream_sample_count = COALESCE(s.stream_count, 0),
        streams_synced_at = CASE
            WHEN COALESCE(s.stream_count, 0) > 0 THEN now()
            ELSE a.streams_synced_at
        END
    FROM (
        SELECT
            COUNT(*) AS stream_count,
            BOOL_OR(lat IS NOT NULL AND lon IS NOT NULL) AS has_coords
        FROM activity_streams
        WHERE athlete_id = target_athlete AND activity_id = target_activity
    ) AS s
    WHERE a.athlete_id = target_athlete AND a.activity_id = target_activity;

    RETURN NULL;
END $function$
"""


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_activity_stream_flags ON activity_streams")
    op.execute(_STATEMENT_FUNCTION)
    # A transition table is allowed on one event only, so insert, update and
    # delete each get their own trigger. Streams are inserted and deleted, never
    # updated in place; the update trigger exists so a manual repair still keeps
    # the flags honest.
    for name, event, clause in (
        ("trg_activity_stream_flags_insert", "INSERT", "REFERENCING NEW TABLE AS new_streams"),
        ("trg_activity_stream_flags_update", "UPDATE", "REFERENCING NEW TABLE AS new_streams"),
        ("trg_activity_stream_flags_delete", "DELETE", "REFERENCING OLD TABLE AS old_streams"),
    ):
        op.execute(
            f"""
            CREATE TRIGGER {name}
            AFTER {event} ON activity_streams
            {clause}
            FOR EACH STATEMENT EXECUTE FUNCTION refresh_activity_stream_flags()
            """
        )


def downgrade() -> None:
    for name in (
        "trg_activity_stream_flags_delete",
        "trg_activity_stream_flags_update",
        "trg_activity_stream_flags_insert",
    ):
        op.execute(f"DROP TRIGGER IF EXISTS {name} ON activity_streams")
    op.execute(_ROW_FUNCTION)
    op.execute(
        """
        CREATE TRIGGER trg_activity_stream_flags
        AFTER INSERT OR UPDATE OR DELETE ON activity_streams
        FOR EACH ROW EXECUTE FUNCTION refresh_activity_stream_flags()
        """
    )
