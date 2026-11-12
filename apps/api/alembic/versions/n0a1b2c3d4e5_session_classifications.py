"""persist session classifications, exact intervals and plan execution quality

Revision ID: n0a1b2c3d4e5
Revises: m9e0f1a2b3c4
Create Date: 2026-11-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "n0a1b2c3d4e5"
down_revision: str | Sequence[str] | None = "m9e0f1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS session_classifications (
            athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
            activity_id TEXT NOT NULL,
            local_day DATE NOT NULL,
            structure TEXT NOT NULL,
            session_type TEXT NOT NULL,
            primary_stimulus TEXT NOT NULL,
            pacing_pattern TEXT NOT NULL,
            display_name TEXT NOT NULL,
            display_line TEXT NOT NULL,
            evidence_grade TEXT NOT NULL,
            confidence DOUBLE PRECISION NOT NULL
                CHECK (confidence >= 0 AND confidence <= 1),
            classification JSONB NOT NULL,
            algorithm_version TEXT NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (athlete_id, activity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_session_classifications_day
            ON session_classifications (athlete_id, local_day DESC);
        CREATE TABLE IF NOT EXISTS activity_intervals (
            athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
            activity_id TEXT NOT NULL,
            payload JSONB NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (athlete_id, activity_id)
        );
        ALTER TABLE training_calendar
            ADD COLUMN IF NOT EXISTS execution JSONB,
            ADD COLUMN IF NOT EXISTS quality JSONB,
            ADD COLUMN IF NOT EXISTS session_classification JSONB;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS session_classifications")
    op.execute("DROP TABLE IF EXISTS activity_intervals")
    op.execute("ALTER TABLE training_calendar DROP COLUMN IF EXISTS session_classification")
    op.execute("ALTER TABLE training_calendar DROP COLUMN IF EXISTS quality")
    op.execute("ALTER TABLE training_calendar DROP COLUMN IF EXISTS execution")
