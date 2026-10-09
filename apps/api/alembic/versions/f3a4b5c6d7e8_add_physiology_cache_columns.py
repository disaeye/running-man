"""add physiology cache columns to athletes

Revision ID: f3a4b5c6d7e8
Revises: e1f2a3b4c5d6
Create Date: 2026-06-27 00:00:00
"""

import sqlalchemy as sa

from alembic import op

revision = "f3a4b5c6d7e8"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("lthr", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("threshold_pace", sa.Float(), nullable=True))
    op.add_column(
        "athletes",
        sa.Column("physiology_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE athletes
        SET lthr = sub.lthr
        FROM (
            SELECT athlete_id, lthr
            FROM ftp_history
            WHERE lthr IS NOT NULL
            ORDER BY effective_from DESC
            LIMIT 1
        ) AS sub
        WHERE athletes.id = sub.athlete_id
        """
    )


def downgrade() -> None:
    op.drop_column("athletes", "physiology_updated_at")
    op.drop_column("athletes", "threshold_pace")
    op.drop_column("athletes", "lthr")
