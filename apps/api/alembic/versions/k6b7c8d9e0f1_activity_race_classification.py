"""Add an explicit race classification to activities.

Revision ID: k6b7c8d9e0f1
Revises: k5a6b7c8d9e0
Create Date: 2026-10-30
"""

from alembic import op

revision = "k6b7c8d9e0f1"
down_revision = "k5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE activity_summary "
        "ADD COLUMN IF NOT EXISTS is_race BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        """
        UPDATE activity_summary
        SET is_race = lower(COALESCE(raw_data->>'race', 'false')) = 'true'
        WHERE raw_data IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE activity_summary AS activity
        SET is_race = true
        WHERE EXISTS (
            SELECT 1 FROM race_results AS result
            WHERE result.athlete_id = activity.athlete_id
              AND result.activity_id = activity.activity_id
        )
        """
    )
    op.execute(
        """
        DROP VIEW IF EXISTS activity_compute;
        CREATE VIEW activity_compute AS
        SELECT activity_id, athlete_id, start_time, sport, distance_m, duration_s,
               avg_hr, max_hr, avg_power, icu_ctl, avg_cadence, avg_speed,
               elevation_gain_m, calories, device_name, external_id, source,
               file_type, raw_data, has_gps, has_hr, has_power, has_cadence,
               source_hash, summary_polyline, synced_at, streams_synced_at,
               stream_sample_count, has_streams, source_weighted_power_w,
               source_training_load, is_race
        FROM activity_summary
        WHERE deleted_at IS NULL AND ignored_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE VIEW activity_compute AS
        SELECT activity_id, athlete_id, start_time, sport, distance_m, duration_s,
               avg_hr, max_hr, avg_power, icu_ctl, avg_cadence, avg_speed,
               elevation_gain_m, calories, device_name, external_id, source,
               file_type, raw_data, has_gps, has_hr, has_power, has_cadence,
               source_hash, summary_polyline, synced_at, streams_synced_at,
               stream_sample_count, has_streams, source_weighted_power_w,
               source_training_load
        FROM activity_summary
        WHERE deleted_at IS NULL AND ignored_at IS NULL
        """
    )
    op.drop_column("activity_summary", "is_race")
