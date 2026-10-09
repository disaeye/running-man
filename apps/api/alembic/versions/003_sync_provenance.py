"""sync provenance tables — superseded by e9f0a1b2c3d4 (absorb)

Revision ID: 003
Revises: e2f3a4b5c6d7
Create Date: 2026-07-13 12:00:00.000000

This revision originally created ``integration_sync_runs``,
``integration_sync_errors`` and ``source_records``. The canonical chain
supersedes it: ``e9f0a1b2c3d4`` (absorb retained schema objects) recreates the
same tables with the canonical definitions (source FK to
``source_definitions``, status CHECKs). Keeping this migration ACTIVE would
make the final schema order-dependent (CREATE TABLE IF NOT EXISTS is
first-writer-wins), so it is neutralized to a no-op marker.

The audit/control tables are small and intentionally NOT partitioned — the
time-series bulk data lives in ``activity_summary``, ``activity_streams`` and
``health_wellness``.

This revision remains in the chain only so databases advanced by the legacy
served-checkout chain (which recorded ``003``) can be recognized.
"""

revision = "003"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: superseded by e9f0a1b2c3d4 (absorb retained schema objects),
    # which creates the canonical sync provenance tables.
    pass


def downgrade() -> None:
    # No-op: dropping the tables here would fight the canonical definition
    # created by e9f0a1b2c3d4.
    pass
