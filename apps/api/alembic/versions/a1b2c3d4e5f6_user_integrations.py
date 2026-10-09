"""user integrations

Revision ID: a1b2c3d4e5f6
Revises: 8c9d0e1f2a3b
Create Date: 2026-06-18 00:00:00.000000
"""

from collections.abc import Sequence
from importlib import import_module

op = import_module("alembic.op")

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "8c9d0e1f2a3b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        athlete_id UUID NOT NULL REFERENCES athletes(id),
        source VARCHAR(50) NOT NULL,
        connected BOOLEAN DEFAULT FALSE,
        credentials JSONB,
        settings JSONB DEFAULT '{}',
        last_sync_at TIMESTAMPTZ,
        last_sync_status VARCHAR(20),
        last_sync_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(athlete_id, source)
    )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_integrations_athlete ON user_integrations(athlete_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_integrations_athlete")
    op.execute("DROP TABLE IF EXISTS user_integrations")
