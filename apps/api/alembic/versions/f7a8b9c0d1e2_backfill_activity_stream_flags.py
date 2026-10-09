"""Make the activity capability flags reflect real stream data.

``activity_summary`` carries four booleans the UI uses to decide what to draw —
``has_gps``, ``has_hr``, ``has_power``, ``has_cadence`` — plus
``has_streams``/``stream_sample_count``/``streams_synced_at``. Three of them
were never true for any activity in this deployment:

``has_gps``
    Set at insert from ``raw_data ? 'latlng'``. No Synced payload contains that
    key (GPS arrives as ``lat``/``lon`` columns on ``activity_streams``), so it
    was false for every row — and the Activities list's "GPS only" filter, which
    tested ``source = 'garmin'``, therefore had two independent reasons to
    return nothing.

``has_streams`` / ``stream_sample_count``
    Columns exist and default to false/0, but no code path ever writes them.
    35 of the 44 activities have stream rows.

This migration backfills all of them from the tables that hold the truth, and
adds a trigger so a stream insert or delete keeps the summary row in step.
Deriving on read instead would mean a subquery per list request; the flags are
a denormalisation that only works if it is maintained, which is what the trigger
is for.

``has_hr``/``has_power``/``has_cadence`` were already derived from the summary
columns at insert time and are left as they are.
"""

import sqlalchemy as sa

from alembic import op

revision = "f7a8b9c0d1e2"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None

# Recompute every derived flag for one activity. Used by the backfill and the
# trigger body.
_REFRESH_SQL = """
UPDATE activity_summary AS a SET
    has_gps = COALESCE(s.has_coords, false),
    has_streams = COALESCE(s.stream_count, 0) > 0,
    stream_sample_count = COALESCE(s.stream_count, 0),
    streams_synced_at = CASE
        WHEN COALESCE(s.stream_count, 0) > 0 THEN s.last_synced_at
        ELSE a.streams_synced_at
    END
FROM (
    SELECT
        %(activity_id)s::text AS activity_id,
        COUNT(*) AS stream_count,
        BOOL_OR(lat IS NOT NULL AND lon IS NOT NULL) AS has_coords,
        MAX(created_at) AS last_synced_at
    FROM activity_streams
    WHERE athlete_id = %(athlete_id)s::uuid AND activity_id = %(activity_id)s::text
) AS s
WHERE a.athlete_id = %(athlete_id)s::uuid AND a.activity_id = %(activity_id)s::text
"""

# One statement for the whole table: an aggregate per activity avoids a
# per-row round trip, which matters on a partitioned table with millions of
# stream rows.
_BACKFILL_SQL = """
WITH aggregates AS (
    SELECT
        s.athlete_id,
        s.activity_id,
        COUNT(*) AS stream_count,
        BOOL_OR(s.lat IS NOT NULL AND s.lon IS NOT NULL) AS has_coords
    FROM activity_streams AS s
    GROUP BY s.athlete_id, s.activity_id
)
UPDATE activity_summary AS a SET
    has_gps = COALESCE(agg.has_coords, false),
    has_streams = COALESCE(agg.stream_count, 0) > 0,
    stream_sample_count = COALESCE(agg.stream_count, 0),
    streams_synced_at = CASE
        WHEN COALESCE(agg.stream_count, 0) > 0 THEN COALESCE(a.synced_at, now())
        ELSE a.streams_synced_at
    END
FROM aggregates AS agg
WHERE a.athlete_id = agg.athlete_id AND a.activity_id = agg.activity_id
"""

# The trigger body: recompute the flags for the row a stream change touched.
# ``_REFRESH_SQL`` is inlined because a plpgsql function cannot take bind
# parameters.
_TRIGGER_FN_SQL = """
CREATE OR REPLACE FUNCTION refresh_activity_stream_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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

    RETURN NULL;  -- AFTER trigger; the return value is ignored
END $$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    _ = bind.execute(sa.text(_BACKFILL_SQL))

    op.execute(_TRIGGER_FN_SQL)
    # Statement-level would miss the per-row aggregate; row-level is correct
    # because a sync inserts a whole activity's samples in one transaction and
    # the recomputation is a single indexed aggregate per statement batch.
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_activity_stream_flags ON activity_streams;
        CREATE TRIGGER trg_activity_stream_flags
        AFTER INSERT OR DELETE ON activity_streams
        FOR EACH ROW EXECUTE FUNCTION refresh_activity_stream_flags();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_activity_stream_flags ON activity_streams")
    op.execute("DROP FUNCTION IF EXISTS refresh_activity_stream_flags()")
    # The backfilled values are left in place: they are correct, and reverting
    # them to false/0 would restore a bug rather than a state.
