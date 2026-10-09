"""add summary_polyline column

Adds summary_polyline TEXT NULL to activity_summary for storing
polyline-encoded route geometry.  The column is nullable because
existing rows have no polyline data.

Revision ID: e2f3a4b5c6d7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-08 12:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS summary_polyline TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE activity_summary DROP COLUMN IF EXISTS summary_polyline")
