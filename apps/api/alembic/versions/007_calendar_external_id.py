"""add unique partial index on training_calendar (athlete_id, external_id)

Revision ID: c007e1f2a3b4
Revises: 006
Create Date: 2026-07-13 18:00:00.000000

Revision id was renamed from ``007`` to ``c007e1f2a3b4``: the revision id
``007`` is also used by ``007_legacy_served_checkout_compat`` (the shim that
recognizes the legacy served-checkout chain's terminal revision), so the two
files collided in the Alembic revision map. This file is the canonical
creator of ``idx_tc_athlete_external``.
"""

from alembic import op

revision = "c007e1f2a3b4"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_athlete_external
        ON training_calendar (athlete_id, external_id)
        WHERE external_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tc_athlete_external")
