"""Allow the weather phase in integration sync jobs.

The sync runner advances a job to the ``weather`` phase after activities,
streams and wellness are done. The phase check constraint still listed only
three phases, so every job that reached weather died with a check violation
and the whole sync was reported as failed.

Revision ID: l8d9e0f1a2b3
Revises: k7c8d9e0f1a2
Create Date: 2026-11-03
"""

from alembic import op

revision = "l8d9e0f1a2b3"
down_revision = "k7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE integration_sync_jobs DROP CONSTRAINT IF EXISTS ck_integration_sync_jobs_phase"
    )
    op.execute(
        "ALTER TABLE integration_sync_jobs "
        "ADD CONSTRAINT ck_integration_sync_jobs_phase "
        "CHECK (phase IN "
        "('activities', 'streams', 'intervals', 'wellness', 'weather'))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE integration_sync_jobs DROP CONSTRAINT IF EXISTS ck_integration_sync_jobs_phase"
    )
    op.execute(
        "ALTER TABLE integration_sync_jobs "
        "ADD CONSTRAINT ck_integration_sync_jobs_phase "
        "CHECK (phase IN ('activities', 'streams', 'wellness'))"
    )
