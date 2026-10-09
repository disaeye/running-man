"""merge canonical head with legacy-reconciliation head

Revision ID: f2a1b2c3d4e5
Revises: 0a1b2c3d4e5f, f1e2d3c4b5a6
Create Date: 2026-08-05 00:00:00

The migration graph previously had two heads:

- ``0a1b2c3d4e5f`` — the canonical chain (fact functions with athlete
  local-day bucketing).
- ``f1e2d3c4b5a6`` — the legacy-reconciliation merge that recognizes
  production databases advanced by the served-checkout chain (recorded
  revision ``007``) and merges the physiology-fact-pointer columns
  (``a0b1c2d3e4f5``) and account-deletion CASCADE FKs (``c1d2e3f4a5b6``).

``alembic upgrade head`` refuses to run with multiple heads, so production
and fresh databases could not share one migration target. This merge makes
the graph single-headed:

- Fresh databases execute every revision (both branches), ending with the
  full object set.
- Production at ``f1e2d3c4b5a6`` additionally applies ``0a1b2c3d4e5f`` (the
  local-day bucketing fix that was previously unreachable from that head).

Both branches are no-ops; their content lives in the merged revisions.
"""

revision = "f2a1b2c3d4e5"
down_revision = ("0a1b2c3d4e5f", "f1e2d3c4b5a6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
