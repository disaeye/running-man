"""add sync detail and provenance

Revision ID: a9b8c7d6e5f4
Revises: f3a4b5c6d7e8
Create Date: 2026-06-29 00:00:00
"""

from alembic import op

revision = "a9b8c7d6e5f4"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_integrations "
        "ADD COLUMN IF NOT EXISTS last_sync_detail JSONB DEFAULT '{}'::jsonb"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS has_gps BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS has_hr BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS has_power BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS has_cadence BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION _has_gps(raw_data jsonb)
        RETURNS boolean
        LANGUAGE sql
        IMMUTABLE
        AS $$
            SELECT coalesce(raw_data ? 'latlng'
                OR raw_data ? 'start_latlng'
                OR raw_data ? 'end_latlng'
                OR (raw_data ? 'lat' AND raw_data ? 'lon')
                OR (raw_data ? 'latitude' AND raw_data ? 'longitude'), false)
        $$
        """
    )
    op.execute(
        """
        UPDATE activity_summary
        SET has_gps = coalesce(_has_gps(raw_data), false),
            has_hr = avg_hr IS NOT NULL,
            has_power = avg_power IS NOT NULL,
            has_cadence = avg_cadence IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS has_cadence")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS has_power")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS has_hr")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS has_gps")
    op.execute("ALTER TABLE user_integrations DROP COLUMN IF EXISTS last_sync_detail")
    op.execute("DROP FUNCTION IF EXISTS _has_gps(jsonb)")
