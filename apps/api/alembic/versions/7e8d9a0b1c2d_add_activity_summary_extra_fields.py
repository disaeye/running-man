"""add activity extra fields as columns

Adds avg_cadence, avg_speed, elevation_gain_m, calories, device_name
to activity_summary.  These fields are present in the Intervals.icu
raw_data JSONB and are consumed by the frontend StatsPanel but were
only stored in raw_data — never materialised as columns.

Backfills existing rows from raw_data so no data is lost.

Revision ID: 7e8d9a0b1c2d
Revises: 2f3a4b5c6d7e
Create Date: 2026-06-17 12:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "7e8d9a0b1c2d"
down_revision: Union[str, Sequence[str], None] = "2f3a4b5c6d7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns as nullable (existing rows stay NULL initially)
    op.execute("ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS avg_cadence DOUBLE PRECISION")
    op.execute("ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS avg_speed DOUBLE PRECISION")
    op.execute(
        "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS elevation_gain_m DOUBLE PRECISION"
    )
    op.execute("ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS calories INTEGER")
    op.execute("ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS device_name TEXT")

    # 2. Backfill existing rows from raw_data JSONB
    op.execute("""
        UPDATE activity_summary
        SET avg_cadence      = (raw_data->>'average_cadence')::double precision,
            avg_speed        = (raw_data->>'average_speed')::double precision,
            elevation_gain_m = (raw_data->>'total_elevation_gain')::double precision,
            calories         = (raw_data->>'calories')::integer,
            device_name      = raw_data->>'device_name'
        WHERE raw_data IS NOT NULL
          AND (avg_cadence IS NULL AND avg_speed IS NULL
           AND elevation_gain_m IS NULL AND calories IS NULL
           AND device_name IS NULL)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS avg_cadence")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS avg_speed")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS elevation_gain_m")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS calories")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS device_name")
