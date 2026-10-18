"""integration sync jobs

Revision ID: h1b2c3d4e5f6
Revises: g0a1b2c3d4e5
Create Date: 2026-10-13 00:00:00

A triggered sync becomes a durable row instead of an in-process task:

1. ``integration_sync_jobs`` holds one row per triggered sync (incremental or
   backfill) with the progress counters the UI polls: window range, windows
   done over total, activities seen / upserted / deduplicated, streams
   inserted, the current phase, ``heartbeat_at`` and ``cancel_requested``.
2. ``integration_sync_runs.job_id`` links each per-window run row to the job
   that produced it, so the run history groups by job.
3. A partial unique index allows at most one active (queued or running) job
   per athlete and source. Concurrent triggers then fail on the index instead
   of racing in application code.

The previous design kept the running state in
``user_integrations.last_sync_status``. A service restart mid-sync left that
value at ``running`` forever, and every later trigger answered 409. The job
row plus the startup sweep replace that state.
"""

from alembic import op

revision = "h1b2c3d4e5f6"
down_revision = "g0a1b2c3d4e5"
branch_labels = None
depends_on = None


_CREATE_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS integration_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    source TEXT NOT NULL REFERENCES source_definitions(source_key),
    kind TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'manual',
    phase TEXT NOT NULL DEFAULT 'activities',
    status TEXT NOT NULL DEFAULT 'queued',
    window_start DATE,
    window_end DATE,
    windows_total INTEGER NOT NULL DEFAULT 0,
    windows_done INTEGER NOT NULL DEFAULT 0,
    activities_seen INTEGER NOT NULL DEFAULT 0,
    activities_upserted INTEGER NOT NULL DEFAULT 0,
    activities_deduplicated INTEGER NOT NULL DEFAULT 0,
    streams_inserted INTEGER NOT NULL DEFAULT 0,
    wellness_days INTEGER NOT NULL DEFAULT 0,
    ghosts_deleted INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    cancel_requested BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_integration_sync_jobs_kind
        CHECK (kind IN ('incremental', 'backfill')),
    CONSTRAINT ck_integration_sync_jobs_status
        CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
    CONSTRAINT ck_integration_sync_jobs_phase
        CHECK (phase IN ('activities', 'streams', 'wellness')),
    CONSTRAINT ck_integration_sync_jobs_windows
        CHECK (
            windows_total >= 0
            AND windows_done >= 0
            AND windows_done <= windows_total
        ),
    CONSTRAINT ck_integration_sync_jobs_counters
        CHECK (
            activities_seen >= 0
            AND activities_upserted >= 0
            AND activities_deduplicated >= 0
            AND streams_inserted >= 0
            AND wellness_days >= 0
            AND ghosts_deleted >= 0
            AND errors_count >= 0
        ),
    CONSTRAINT ck_integration_sync_jobs_errors_array
        CHECK (jsonb_typeof(errors) = 'array'),
    CONSTRAINT ck_integration_sync_jobs_window_range
        CHECK (window_start IS NULL OR window_end IS NULL OR window_start <= window_end)
);

ALTER TABLE integration_sync_runs
    ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES integration_sync_jobs(id) ON DELETE SET NULL;
"""

_STATUS_CONSTRAINT_SQL = """
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS ck_user_integrations_last_sync_status;

ALTER TABLE user_integrations
    ADD CONSTRAINT ck_user_integrations_last_sync_status
    CHECK (
        last_sync_status IS NULL
        OR last_sync_status IN ('running', 'success', 'failed', 'skipped', 'cancelled')
    );
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_athlete_created
    ON integration_sync_jobs (athlete_id, source, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_sync_jobs_active
    ON integration_sync_jobs (athlete_id, source)
    WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_job
    ON integration_sync_runs (job_id);
"""


def upgrade() -> None:
    op.execute(_CREATE_JOBS_SQL)
    op.execute(_INDEXES_SQL)
    op.execute(_STATUS_CONSTRAINT_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_integration_sync_runs_job")
    op.execute("DROP INDEX IF EXISTS uq_integration_sync_jobs_active")
    op.execute("DROP INDEX IF EXISTS idx_integration_sync_jobs_athlete_created")
    op.execute("ALTER TABLE integration_sync_runs DROP COLUMN IF EXISTS job_id")
    op.execute("DROP TABLE IF EXISTS integration_sync_jobs CASCADE")
    op.execute("ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS ck_user_integrations_last_sync_status")
    op.execute(
        """
        ALTER TABLE user_integrations
            ADD CONSTRAINT ck_user_integrations_last_sync_status
            CHECK (
                last_sync_status IS NULL
                OR last_sync_status IN ('running', 'success', 'failed', 'skipped')
            )
        """
    )
