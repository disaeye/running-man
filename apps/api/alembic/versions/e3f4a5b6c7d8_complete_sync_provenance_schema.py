"""complete sync provenance schema (indexes, dedup key, CHECKs, source FKs)

Revision ID: e3f4a5b6c7d8
Revises: f2a1b2c3d4e5
Create Date: 2026-08-05 00:00:00

The sync provenance tables have two historical definitions:

- legacy ``003`` — three indexes (``idx_isr_athlete_started``,
  ``idx_ise_sync_run``, ``idx_sr_athlete_entity``) and the
  ``source_records`` dedup key ``UNIQUE (athlete_id, source, entity_type,
  source_record_id)``; no status CHECKs, no source FK.
- canonical absorb (``e9f0a1b2c3d4``) — status CHECKs and
  ``source`` FK to ``source_definitions``; no indexes, no dedup key.

Production was advanced by the legacy chain, so it carries the legacy
indexes/dedup key; fresh databases carry the canonical CHECKs/FKs. Neither is
complete. This migration closes the gap in both directions so every database
ends with the union of the two definitions. All statements are idempotent
(``IF NOT EXISTS`` / ``DROP CONSTRAINT IF EXISTS``), and existing production
data has been verified against the new constraints (status values and source
keys are all canonical, no duplicate dedup tuples).
"""

from alembic import op

revision = "e3f4a5b6c7d8"
down_revision = "f2a1b2c3d4e5"
branch_labels = None
depends_on = None

# Names as created by the legacy 003 definition / canonical absorb definition
# (Postgres auto-generated names for inline UNIQUE(...) and REFERENCES(...)).
_LEGACY_DEDUP_INDEX = "source_records_athlete_id_source_entity_type_source_record__key"
_LEGACY_SOURCE_FKS = (
    "integration_sync_runs_source_fkey",
    "integration_sync_errors_source_fkey",
    "source_records_source_fkey",
)

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_isr_athlete_started
    ON integration_sync_runs(athlete_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ise_sync_run
    ON integration_sync_errors(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sr_athlete_entity
    ON source_records(athlete_id, entity_type, source_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_records_dedup
    ON source_records (athlete_id, source, entity_type, source_record_id);
"""

_CHECK_SQL = """
ALTER TABLE integration_sync_runs
    DROP CONSTRAINT IF EXISTS ck_integration_sync_runs_status;
ALTER TABLE integration_sync_runs
    ADD CONSTRAINT ck_integration_sync_runs_status
        CHECK (status IN ('running', 'success', 'failed', 'skipped'));
ALTER TABLE source_records
    DROP CONSTRAINT IF EXISTS ck_source_records_status;
ALTER TABLE source_records
    ADD CONSTRAINT ck_source_records_status
        CHECK (status IN ('active', 'rejected', 'ignored'));
"""

_FK_SQL = """
ALTER TABLE integration_sync_runs
    DROP CONSTRAINT IF EXISTS integration_sync_runs_source_fkey,
    DROP CONSTRAINT IF EXISTS fk_integration_sync_runs_source_definition;
ALTER TABLE integration_sync_runs
    ADD CONSTRAINT fk_integration_sync_runs_source_definition
        FOREIGN KEY (source) REFERENCES source_definitions(source_key);
ALTER TABLE integration_sync_errors
    DROP CONSTRAINT IF EXISTS integration_sync_errors_source_fkey,
    DROP CONSTRAINT IF EXISTS fk_integration_sync_errors_source_definition;
ALTER TABLE integration_sync_errors
    ADD CONSTRAINT fk_integration_sync_errors_source_definition
        FOREIGN KEY (source) REFERENCES source_definitions(source_key);
ALTER TABLE source_records
    DROP CONSTRAINT IF EXISTS source_records_source_fkey,
    DROP CONSTRAINT IF EXISTS fk_source_records_source_definition;
ALTER TABLE source_records
    ADD CONSTRAINT fk_source_records_source_definition
        FOREIGN KEY (source) REFERENCES source_definitions(source_key);
"""


def upgrade() -> None:
    op.execute(_INDEXES_SQL)
    op.execute(_CHECK_SQL)
    op.execute(_FK_SQL)


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE integration_sync_runs
            DROP CONSTRAINT IF EXISTS fk_integration_sync_runs_source_definition;
        ALTER TABLE integration_sync_errors
            DROP CONSTRAINT IF EXISTS fk_integration_sync_errors_source_definition;
        ALTER TABLE source_records
            DROP CONSTRAINT IF EXISTS fk_source_records_source_definition;
        ALTER TABLE integration_sync_runs
            DROP CONSTRAINT IF EXISTS ck_integration_sync_runs_status;
        ALTER TABLE source_records
            DROP CONSTRAINT IF EXISTS ck_source_records_status;
        DROP INDEX IF EXISTS uq_source_records_dedup;
        DROP INDEX IF EXISTS idx_sr_athlete_entity;
        DROP INDEX IF EXISTS idx_ise_sync_run;
        DROP INDEX IF EXISTS idx_isr_athlete_started;
        """
    )
