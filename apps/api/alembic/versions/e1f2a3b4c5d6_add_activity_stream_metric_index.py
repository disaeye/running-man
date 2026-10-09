"""add activity stream metric lookup index

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-26 15:54:00
"""

from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ast_athlete_metric_activity_time
        ON activity_streams (athlete_id, metric_type, activity_id, sample_time)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_as_athlete_activity_start_time
        ON activity_summary (athlete_id, activity_id, start_time)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_as_athlete_activity_start_time")
    op.execute("DROP INDEX IF EXISTS idx_ast_athlete_metric_activity_time")
