"""add gear, share tokens, and notification rules tables

Revision ID: d0e1f2a3b4c5
Revises: c4d5e6f7a8b9
Create Date: 2026-06-23 00:00:00.000000
"""

from collections.abc import Sequence
from importlib import import_module

op = import_module("alembic.op")

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS gear_shoes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id        UUID NOT NULL REFERENCES athletes(id),
    name              TEXT NOT NULL,
    brand             TEXT,
    model             TEXT,
    purchase_date     DATE,
    current_mileage_m REAL DEFAULT 0,
    retired_at        TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gear_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id TEXT NOT NULL,
    shoe_id     UUID NOT NULL REFERENCES gear_shoes(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS share_tokens (
    token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id  UUID NOT NULL REFERENCES athletes(id),
    activity_id TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id    UUID NOT NULL REFERENCES athletes(id),
    rule_type     TEXT NOT NULL,
    enabled       BOOLEAN DEFAULT TRUE,
    last_fired_at TIMESTAMPTZ,
    config        JSONB DEFAULT '{}'
);
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_gear_shoes_athlete
    ON gear_shoes (athlete_id);

CREATE INDEX IF NOT EXISTS idx_gear_assignments_shoe
    ON gear_assignments (shoe_id);

CREATE INDEX IF NOT EXISTS idx_share_tokens_activity
    ON share_tokens (activity_id);

CREATE INDEX IF NOT EXISTS idx_notification_rules_athlete_type
    ON notification_rules (athlete_id, rule_type);
"""


def upgrade() -> None:
    op.execute(_TABLES_SQL)
    op.execute(_INDEXES_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notification_rules_athlete_type")
    op.execute("DROP INDEX IF EXISTS idx_share_tokens_activity")
    op.execute("DROP INDEX IF EXISTS idx_gear_assignments_shoe")
    op.execute("DROP INDEX IF EXISTS idx_gear_shoes_athlete")

    op.execute("DROP TABLE IF EXISTS gear_assignments CASCADE")
    op.execute("DROP TABLE IF EXISTS share_tokens CASCADE")
    op.execute("DROP TABLE IF EXISTS notification_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS gear_shoes CASCADE")
