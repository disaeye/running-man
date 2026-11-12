"""Add display fields to goal milestones.

Revision ID: k7c8d9e0f1a2
Revises: k6b7c8d9e0f1
Create Date: 2026-10-30
"""

from alembic import op

revision = "k7c8d9e0f1a2"
down_revision = "k6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE milestones ADD COLUMN IF NOT EXISTS unit TEXT")
    op.execute("ALTER TABLE milestones ADD COLUMN IF NOT EXISTS result_text TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE milestones DROP COLUMN IF EXISTS result_text")
    op.execute("ALTER TABLE milestones DROP COLUMN IF EXISTS unit")
