"""add soft-delete and ignore flags to activities

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-11 20:00:00

Two distinct ways to take an activity out of the numbers, because they answer
different questions:

``deleted_at``
    "This record should not exist." Set when a sync imported something that is
    not the athlete's (a duplicate, another person's file, a mis-mapped
    upload). Reads hide it, the sync must not resurrect it, and the athlete can
    undo it from a trash view.

``ignored_at``
    "This happened, but it is not training." Set for commutes, warm-ups, walks
    and strength sessions that would otherwise inflate load and shift heart-rate
    zones. The activity stays visible in lists (so the athlete can tell where
    it went) but contributes to nothing.

Both must be excluded from every derived number, which is the part that has to
be got right: load, PMC, personal records, goal progress, data-quality counts
and the HR zone histograms each query ``activity_summary`` from different
modules. Rather than edit a dozen queries and rely on future contributors
remembering, this migration adds ``activity_compute`` — the same table with
both flags filtered — and the compute paths read that. A view cannot fall out
of sync with the flags the way a copy-pasted ``WHERE`` clause can.
"""

import sqlalchemy as sa

from alembic import op
from infrastructure.db.migration_sql.activity_ignore_sql import (
    DAILY_FACTS_SQL_BASE,
    DAILY_FACTS_SQL_COMPUTE,
)

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None

# Columns the view exposes: every column of activity_summary. Listed explicitly
# so the view does not silently change shape when the table gains a column
# (which would need a follow-up migration to be intentional).
_ACTIVITY_COLUMNS = (
    "activity_id",
    "athlete_id",
    "start_time",
    "sport",
    "distance_m",
    "duration_s",
    "avg_hr",
    "max_hr",
    "avg_power",
    "icu_ctl",
    "avg_cadence",
    "avg_speed",
    "elevation_gain_m",
    "calories",
    "device_name",
    "external_id",
    "source",
    "file_type",
    "raw_data",
    "has_gps",
    "has_hr",
    "has_power",
    "has_cadence",
    "source_hash",
    "summary_polyline",
    "synced_at",
    "streams_synced_at",
    "stream_sample_count",
    "has_streams",
    "source_weighted_power_w",
    "source_training_load",
)


def upgrade() -> None:
    op.add_column(
        "activity_summary",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "activity_summary",
        sa.Column("ignored_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Partial indexes: both flags are almost always NULL, so indexing only the
    # set rows keeps the index tiny and still lets the trash/ignored views list
    # them without a sequential scan.
    op.create_index(
        "idx_activity_summary_deleted",
        "activity_summary",
        ["athlete_id", "deleted_at"],
        postgresql_where=sa.text("deleted_at IS NOT NULL"),
    )
    op.create_index(
        "idx_activity_summary_ignored",
        "activity_summary",
        ["athlete_id", "ignored_at"],
        postgresql_where=sa.text("ignored_at IS NOT NULL"),
    )

    columns = ", ".join(_ACTIVITY_COLUMNS)
    op.execute(
        f"""
        CREATE OR REPLACE VIEW activity_compute AS
        SELECT {columns}
        FROM activity_summary
        WHERE deleted_at IS NULL AND ignored_at IS NULL
        """
    )
    # The view is read by every derived-load query, so it must be readable by
    # the application role without extra grants.

    # ``get_athlete_daily_facts`` reads activity_summary directly, so the view
    # alone is not enough: the daily/weekly metric stream would still include
    # ignored activities. Redefine it against the view. The body below is the
    # live definition with only that table reference changed, so the two cannot
    # drift.
    op.execute(DAILY_FACTS_SQL_COMPUTE)

    op.execute("COMMENT ON VIEW activity_compute IS 'activity_summary minus deleted and ignored rows; the input to all derived numbers'")


# The daily-facts function with its activity table reference pointed at the
# view. Kept as a module constant so the test that exercises it can apply the
# same SQL to the test database, and so a change to one is a change to both.


def _restore_daily_facts_against_activity_summary() -> None:
    """Point the daily-facts function back at the base table."""
    op.execute(DAILY_FACTS_SQL_BASE)


def downgrade() -> None:
    _restore_daily_facts_against_activity_summary()
    op.execute("DROP VIEW IF EXISTS activity_compute")
    op.drop_index("idx_activity_summary_ignored", table_name="activity_summary")
    op.drop_index("idx_activity_summary_deleted", table_name="activity_summary")
    op.drop_column("activity_summary", "ignored_at")
    op.drop_column("activity_summary", "deleted_at")
