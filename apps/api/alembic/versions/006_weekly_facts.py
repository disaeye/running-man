"""create get_athlete_weekly_facts function — superseded by b1c2d3e4f5a6 + 0a1b2c3d4e5f

Revision ID: 006
Revises: 005
Create Date: 2026-07-13 16:00:00.000000

This revision originally created ``get_athlete_weekly_facts`` (aggregating the
UTC-day daily facts by ISO week). The canonical chain supersedes it:
``b1c2d3e4f5a6`` rewrites the fact functions over the current projections and
``0a1b2c3d4e5f`` makes them athlete-local-day aware. Since the canonical
rewrites are ``CREATE OR REPLACE``, the final function state depends on
execution order; keeping this migration ACTIVE would let the old UTC
aggregation overwrite the timezone-aware one. It is therefore neutralized to
a no-op marker.

This revision remains in the chain only so databases advanced by the legacy
served-checkout chain (which recorded ``006``) can be recognized.
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: superseded by b1c2d3e4f5a6 (rewrite fact functions over current
    # projections) and 0a1b2c3d4e5f (athlete local-day bucketing).
    pass


def downgrade() -> None:
    # No-op: the canonical fact functions are owned by the canonical chain.
    op.execute("DROP FUNCTION IF EXISTS get_athlete_weekly_facts(UUID, DATE, DATE)")
