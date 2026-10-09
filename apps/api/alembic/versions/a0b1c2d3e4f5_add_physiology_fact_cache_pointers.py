"""add physiology fact cache pointers

Revision ID: a0b1c2d3e4f5
Revises: e9f0a1b2c3d4
Create Date: 2026-07-15 00:00:00
"""

from alembic import op

revision = "a0b1c2d3e4f5"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""
ALTER TABLE athletes
    ADD COLUMN IF NOT EXISTS physiology_computation_run_id UUID REFERENCES computation_runs(id),
    ADD COLUMN IF NOT EXISTS physiology_algorithm_version TEXT,
    ADD CONSTRAINT ck_athletes_physiology_algorithm_semver
        CHECK (
            physiology_algorithm_version IS NULL
            OR physiology_algorithm_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
        ) NOT VALID;

ALTER TABLE ftp_history
    ADD COLUMN IF NOT EXISTS detected_ftp INTEGER,
    ADD COLUMN IF NOT EXISTS detected_ftp_computation_run_id UUID REFERENCES computation_runs(id),
    ADD COLUMN IF NOT EXISTS detected_ftp_algorithm_version TEXT,
    ADD COLUMN IF NOT EXISTS ftp_source TEXT NOT NULL DEFAULT 'manual',
    ADD CONSTRAINT ck_ftp_history_source
        CHECK (ftp_source IN ('manual', 'detected')) NOT VALID,
    ADD CONSTRAINT ck_ftp_history_detected_ftp
        CHECK (detected_ftp IS NULL OR detected_ftp BETWEEN 1 AND 1000) NOT VALID,
    ADD CONSTRAINT ck_ftp_history_detected_algorithm_semver
        CHECK (
            detected_ftp_algorithm_version IS NULL
            OR detected_ftp_algorithm_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
        ) NOT VALID;
"""

_DOWNGRADE_SQL = r"""
ALTER TABLE ftp_history
    DROP CONSTRAINT IF EXISTS ck_ftp_history_detected_algorithm_semver,
    DROP CONSTRAINT IF EXISTS ck_ftp_history_detected_ftp,
    DROP CONSTRAINT IF EXISTS ck_ftp_history_source,
    DROP COLUMN IF EXISTS ftp_source,
    DROP COLUMN IF EXISTS detected_ftp_algorithm_version,
    DROP COLUMN IF EXISTS detected_ftp_computation_run_id,
    DROP COLUMN IF EXISTS detected_ftp;

ALTER TABLE athletes
    DROP CONSTRAINT IF EXISTS ck_athletes_physiology_algorithm_semver,
    DROP COLUMN IF EXISTS physiology_algorithm_version,
    DROP COLUMN IF EXISTS physiology_computation_run_id;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
