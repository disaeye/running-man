"""add wellness vo2max and steps

Revision ID: 8c9d0e1f2a3b
Revises: 9b1d3c7e8f20
Create Date: 2026-06-18 00:00:00.000000
"""

from collections.abc import Sequence
from importlib import import_module

op = import_module("alembic.op")

revision: str = "8c9d0e1f2a3b"
down_revision: str | Sequence[str] | None = "9b1d3c7e8f20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE health_wellness ADD COLUMN IF NOT EXISTS vo2max DOUBLE PRECISION")
    op.execute("ALTER TABLE health_wellness ADD COLUMN IF NOT EXISTS steps INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE health_wellness DROP COLUMN IF EXISTS steps")
    op.execute("ALTER TABLE health_wellness DROP COLUMN IF EXISTS vo2max")
