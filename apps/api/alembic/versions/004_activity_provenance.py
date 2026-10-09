"""add activity_summary provenance and has_streams columns

Revision ID: 004
Revises: 003
Create Date: 2026-07-13 12:10:00.000000
"""

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add provenance columns to activity_summary
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS streams_synced_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS stream_sample_count INTEGER DEFAULT 0"
    )

    # Add has_streams column
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS has_streams BOOLEAN DEFAULT FALSE"
    )

    # Backfill has_streams from activity_streams
    op.execute(
        """
        UPDATE activity_summary
        SET has_streams = EXISTS (
            SELECT 1 FROM activity_streams
            WHERE activity_streams.activity_id = activity_summary.activity_id
              AND activity_streams.athlete_id = activity_summary.athlete_id
            LIMIT 1
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS has_streams")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS stream_sample_count")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS streams_synced_at")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS synced_at")
