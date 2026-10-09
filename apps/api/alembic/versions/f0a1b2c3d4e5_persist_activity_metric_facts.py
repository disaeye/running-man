"""persist activity metric facts

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-07-15 00:00:00
"""

from alembic import op

revision = "f0a1b2c3d4e5"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None

_ADD_SOURCE_COLUMNS_SQL = """
ALTER TABLE activity_summary
    ADD COLUMN IF NOT EXISTS source_weighted_power_w DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS source_training_load DOUBLE PRECISION;

UPDATE activity_summary
SET source_weighted_power_w = COALESCE(
        source_weighted_power_w,
        (raw_data->>'weighted_average_watts')::double precision,
        (raw_data->>'icu_weighted_avg_watts')::double precision
    ),
    source_training_load = COALESCE(
        source_training_load,
        (raw_data->>'icu_training_load')::double precision,
        (raw_data->>'training_load')::double precision
    )
WHERE raw_data IS NOT NULL
  AND (
      raw_data ? 'weighted_average_watts'
      OR raw_data ? 'icu_weighted_avg_watts'
      OR raw_data ? 'icu_training_load'
      OR raw_data ? 'training_load'
  );
"""

_DROP_DERIVED_COLUMNS_SQL = """
ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS ck_activity_summary_power;
ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS ck_activity_summary_load;
ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS ck_activity_summary_source_load;

ALTER TABLE activity_summary
    DROP COLUMN IF EXISTS np,
    DROP COLUMN IF EXISTS intensity_factor,
    DROP COLUMN IF EXISTS tss;

ALTER TABLE activity_summary
    ADD CONSTRAINT ck_activity_summary_power
        CHECK (
            (avg_power IS NULL OR avg_power BETWEEN 0 AND 3000)
            AND (source_weighted_power_w IS NULL OR source_weighted_power_w BETWEEN 0 AND 3000)
        ) NOT VALID,
    ADD CONSTRAINT ck_activity_summary_source_load
        CHECK (source_training_load IS NULL OR source_training_load BETWEEN 0 AND 10000) NOT VALID;
"""


def upgrade() -> None:
    op.execute(_ADD_SOURCE_COLUMNS_SQL)
    op.execute(_DROP_DERIVED_COLUMNS_SQL)


def downgrade() -> None:
    op.execute("ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS ck_activity_summary_source_load")
    op.execute("ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS ck_activity_summary_power")
    op.execute(
        """
        ALTER TABLE activity_summary
            ADD COLUMN IF NOT EXISTS np DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS intensity_factor DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS tss DOUBLE PRECISION,
            ADD CONSTRAINT ck_activity_summary_power
                CHECK (
                    (avg_power IS NULL OR avg_power BETWEEN 0 AND 3000)
                    AND (np IS NULL OR np BETWEEN 0 AND 3000)
                ) NOT VALID,
            ADD CONSTRAINT ck_activity_summary_load
                CHECK (
                    (intensity_factor IS NULL OR intensity_factor BETWEEN 0 AND 5)
                    AND (tss IS NULL OR tss BETWEEN 0 AND 10000)
                ) NOT VALID
        """
    )
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS source_training_load")
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS source_weighted_power_w")
