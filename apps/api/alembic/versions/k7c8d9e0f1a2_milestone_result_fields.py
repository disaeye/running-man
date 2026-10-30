"""Add display fields to goal milestones.

Revision ID: k7c8d9e0f1a2
Revises: k6b7c8d9e0f1
Create Date: 2026-10-30
"""

import sqlalchemy as sa

from alembic import op

revision = "k7c8d9e0f1a2"
down_revision = "k6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("milestones", sa.Column("unit", sa.Text(), nullable=True))
    op.add_column("milestones", sa.Column("result_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("milestones", "result_text")
    op.drop_column("milestones", "unit")
