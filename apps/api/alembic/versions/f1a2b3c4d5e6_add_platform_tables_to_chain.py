"""add platform tables missing from alembic chain

Brings zone_overrides, activity_laps, notifications, notification_prefs,
and source_hash into the migration chain. These were previously only
defined in infra/db/schema/002_platform_tables.sql (baseline SQL),
creating a parallel schema source that drifted from alembic.

Revision ID: f1a2b3c4d5e6
Revises: a9b8c7d6e5f4
"""

from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "a9b8c7d6e5f4"
branch_labels = None
depends_on = None

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS zone_overrides (
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    metric VARCHAR(10) NOT NULL,
    zone SMALLINT NOT NULL,
    min_pct FLOAT NOT NULL,
    max_pct FLOAT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (athlete_id, metric, zone)
);

CREATE TABLE IF NOT EXISTS activity_laps (
    lap_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id TEXT NOT NULL,
    athlete_id UUID NOT NULL,
    lap_index INTEGER NOT NULL,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    distance_m FLOAT,
    duration_s INTEGER,
    avg_hr SMALLINT,
    max_hr SMALLINT,
    avg_power SMALLINT,
    np FLOAT
);
CREATE INDEX IF NOT EXISTS idx_activity_laps_activity ON activity_laps(activity_id);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_athlete_unread
    ON notifications(athlete_id) WHERE read = FALSE;
"""

_COLUMNS_SQL = """
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}';
ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_as_source_hash
    ON activity_summary(athlete_id, source_hash) WHERE source_hash IS NOT NULL;
"""

_DROP_COLUMNS_SQL = """
DROP INDEX IF EXISTS idx_as_source_hash;
ALTER TABLE activity_summary DROP COLUMN IF EXISTS source_hash;
ALTER TABLE athletes DROP COLUMN IF EXISTS notification_prefs;
"""

_DROP_TABLES_SQL = """
DROP INDEX IF EXISTS idx_notifications_athlete_unread;
DROP TABLE IF EXISTS notifications;
DROP INDEX IF EXISTS idx_activity_laps_activity;
DROP TABLE IF EXISTS activity_laps;
DROP TABLE IF EXISTS zone_overrides;
"""


def upgrade() -> None:
    op.execute(_TABLES_SQL)
    op.execute(_COLUMNS_SQL)


def downgrade() -> None:
    op.execute(_DROP_COLUMNS_SQL)
    op.execute(_DROP_TABLES_SQL)
