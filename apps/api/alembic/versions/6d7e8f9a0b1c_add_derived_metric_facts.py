"""add derived metric facts

Revision ID: 6d7e8f9a0b1c
Revises: c007e1f2a3b4
Create Date: 2026-07-15 00:00:00

``down_revision`` was rewired from ``e2f3a4b5c6d7`` to ``c007e1f2a3b4`` so
the canonical fact chain extends the sync-provenance chain instead of
branching off it. This makes the graph a single spine: the legacy
``003``-``007`` revisions run before the canonical chain, so the canonical
``CREATE OR REPLACE`` fact functions are always the final writers and the
absorb migration (``e9f0a1b2c3d4``) always sees its sync tables already
created. Databases that applied the old graph are unaffected: Alembic tracks
revisions by id, and this revision is already recorded wherever the old
``e2f3a4b5c6d7`` parent edge was traversed.
"""

from alembic import op

revision = "6d7e8f9a0b1c"
down_revision = "c007e1f2a3b4"
branch_labels = None
depends_on = None


_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS computation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    computation_kind TEXT NOT NULL,
    algorithm_version TEXT NOT NULL,
    input_fingerprint CHAR(64) NOT NULL,
    trigger TEXT NOT NULL,
    input_window_start TIMESTAMPTZ,
    input_window_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    rows_affected INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_computation_runs_kind_not_blank
        CHECK (length(btrim(computation_kind)) > 0),
    CONSTRAINT ck_computation_runs_algorithm_semver
        CHECK (algorithm_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'),
    CONSTRAINT ck_computation_runs_fingerprint_sha256
        CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_computation_runs_trigger_not_blank
        CHECK (length(btrim(trigger)) > 0),
    CONSTRAINT ck_computation_runs_status
        CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    CONSTRAINT ck_computation_runs_rows_affected
        CHECK (rows_affected >= 0),
    CONSTRAINT ck_computation_runs_window
        CHECK (input_window_start IS NULL OR input_window_end IS NULL OR input_window_start <= input_window_end),
    CONSTRAINT ck_computation_runs_detail_object
        CHECK (jsonb_typeof(detail) = 'object')
);

CREATE TABLE IF NOT EXISTS metric_definitions (
    metric_key TEXT PRIMARY KEY,
    unit TEXT NOT NULL,
    display_unit TEXT NOT NULL DEFAULT '',
    value_type TEXT NOT NULL DEFAULT 'numeric',
    classification TEXT NOT NULL,
    materialization TEXT NOT NULL,
    null_semantics TEXT NOT NULL,
    legal_min DOUBLE PRECISION,
    legal_max DOUBLE PRECISION,
    ui_precision SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deprecated_at TIMESTAMPTZ,
    CONSTRAINT uq_metric_definitions_key_unit UNIQUE (metric_key, unit),
    CONSTRAINT ck_metric_definitions_key_not_blank
        CHECK (length(btrim(metric_key)) > 0),
    CONSTRAINT ck_metric_definitions_unit_not_blank
        CHECK (length(btrim(unit)) > 0),
    CONSTRAINT ck_metric_definitions_value_type
        CHECK (value_type = 'numeric'),
    CONSTRAINT ck_metric_definitions_range
        CHECK (legal_min IS NULL OR legal_max IS NULL OR legal_min <= legal_max),
    CONSTRAINT ck_metric_definitions_precision
        CHECK (ui_precision >= 0)
);

CREATE TABLE IF NOT EXISTS derived_metric_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    unit TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    algorithm_version TEXT NOT NULL,
    computation_run_id UUID NOT NULL REFERENCES computation_runs(id),
    method TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_derived_metric_fact_version UNIQUE (
        athlete_id,
        subject_type,
        subject_key,
        metric_key,
        effective_at,
        algorithm_version
    ),
    CONSTRAINT fk_derived_metric_facts_definition
        FOREIGN KEY (metric_key, unit)
        REFERENCES metric_definitions(metric_key, unit),
    CONSTRAINT ck_derived_metric_facts_subject_type
        CHECK (subject_type IN ('athlete', 'activity', 'day', 'sport_day')),
    CONSTRAINT ck_derived_metric_facts_subject_key
        CHECK (length(btrim(subject_key)) > 0),
    CONSTRAINT ck_derived_metric_facts_algorithm_semver
        CHECK (algorithm_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'),
    CONSTRAINT ck_derived_metric_facts_method
        CHECK (length(btrim(method)) > 0),
    CONSTRAINT ck_derived_metric_facts_confidence
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    CONSTRAINT ck_derived_metric_facts_metadata_object
        CHECK (jsonb_typeof(metadata) = 'object')
);
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_computation_runs_athlete_kind_started
    ON computation_runs (athlete_id, computation_kind, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_computation_runs_success_fingerprint
    ON computation_runs (athlete_id, computation_kind, algorithm_version, input_fingerprint)
    WHERE status = 'success';

CREATE INDEX IF NOT EXISTS idx_derived_metric_facts_subject_time
    ON derived_metric_facts (athlete_id, subject_type, subject_key, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_derived_metric_facts_metric_time
    ON derived_metric_facts (athlete_id, metric_key, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_derived_metric_facts_current_read
    ON derived_metric_facts (
        athlete_id,
        subject_type,
        subject_key,
        metric_key,
        effective_at DESC,
        computed_at DESC
    );
"""

_VIEWS_SQL = """
CREATE OR REPLACE VIEW current_metric_definitions AS
SELECT *
FROM metric_definitions
WHERE deprecated_at IS NULL;

CREATE OR REPLACE VIEW current_derived_metric_facts AS
SELECT DISTINCT ON (f.athlete_id, f.subject_type, f.subject_key, f.metric_key)
    f.*
FROM derived_metric_facts AS f
JOIN computation_runs AS r ON r.id = f.computation_run_id
WHERE r.status = 'success'
ORDER BY
    f.athlete_id,
    f.subject_type,
    f.subject_key,
    f.metric_key,
    f.effective_at DESC,
    f.computed_at DESC,
    f.id DESC;
"""


def upgrade() -> None:
    op.execute(_CREATE_TABLES_SQL)
    op.execute(_INDEXES_SQL)
    op.execute(_VIEWS_SQL)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS current_derived_metric_facts")
    op.execute("DROP VIEW IF EXISTS current_metric_definitions")
    op.execute("DROP TABLE IF EXISTS derived_metric_facts CASCADE")
    op.execute("DROP TABLE IF EXISTS metric_definitions CASCADE")
    op.execute("DROP TABLE IF EXISTS computation_runs CASCADE")
