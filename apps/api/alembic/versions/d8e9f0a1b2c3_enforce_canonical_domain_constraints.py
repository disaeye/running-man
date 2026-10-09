"""enforce canonical domain constraints

Revision ID: d8e9f0a1b2c3
Revises: b7c8d9e0f1a2
Create Date: 2026-07-15 00:00:00
"""

import sqlalchemy as sa

from alembic import op
from infrastructure.db.domain_constraint_sql import (
    ACTIVITY_STREAM_INDEX_SQL,
    ACTIVITY_SUMMARY_CONSTRAINTS_SQL,
    DERIVED_FACT_BOUNDS_SQL,
    SOURCE_STATUS_CONSTRAINTS_SQL,
    WELLNESS_STRENGTH_STATUS_SQL,
    activity_stream_constraints_sql,
    constraint_targets,
)
from infrastructure.db.domain_constraints import (
    metric_rows,
    source_rows,
    sport_rows,
    stream_rows,
)

revision = "d8e9f0a1b2c3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS source_definitions (
    source_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    adapter_only_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    input_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_source_definitions_key CHECK (length(btrim(source_key)) > 0),
    CONSTRAINT ck_source_definitions_arrays CHECK (
        jsonb_typeof(aliases) = 'array'
        AND jsonb_typeof(adapter_only_aliases) = 'array'
        AND jsonb_typeof(input_metrics) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS sport_definitions (
    sport_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    family TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_sport_definitions_key CHECK (length(btrim(sport_key)) > 0),
    CONSTRAINT ck_sport_definitions_aliases CHECK (jsonb_typeof(aliases) = 'array')
);

CREATE TABLE IF NOT EXISTS stream_metric_definitions (
    metric_key TEXT PRIMARY KEY,
    unit TEXT NOT NULL,
    display_unit TEXT NOT NULL DEFAULT '',
    null_semantics TEXT NOT NULL,
    legal_min DOUBLE PRECISION NOT NULL,
    legal_max DOUBLE PRECISION NOT NULL,
    adapter_only_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_stream_metric_definitions_key_unit UNIQUE (metric_key, unit),
    CONSTRAINT ck_stream_metric_definitions_key CHECK (length(btrim(metric_key)) > 0),
    CONSTRAINT ck_stream_metric_definitions_unit CHECK (length(btrim(unit)) > 0),
    CONSTRAINT ck_stream_metric_definitions_range CHECK (legal_min <= legal_max),
    CONSTRAINT ck_stream_metric_definitions_aliases CHECK (jsonb_typeof(adapter_only_aliases) = 'array')
);
"""

_ACTIVITY_SOURCE_COLUMNS_SQL = """
ALTER TABLE activity_summary
    ADD COLUMN IF NOT EXISTS source_weighted_power_w DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS source_training_load DOUBLE PRECISION;
"""

_NORMALIZE_LEGACY_KEYS_SQL = """
UPDATE activity_summary
SET source = 'intervals_icu'
WHERE source = 'intervals.icu';

UPDATE activity_summary
SET sport = CASE sport
    WHEN 'AlpineSki' THEN 'alpine_ski'
    WHEN 'Hike' THEN 'hike'
    WHEN 'Ride' THEN 'ride'
    WHEN 'Bike' THEN 'ride'
    WHEN 'Run' THEN 'run'
    WHEN 'Swim' THEN 'swim'
    WHEN 'TrailRun' THEN 'trail_run'
    WHEN 'VirtualRide' THEN 'virtual_ride'
    WHEN 'VirtualRun' THEN 'virtual_run'
    WHEN 'Walk' THEN 'walk'
    WHEN 'WeightTraining' THEN 'weight_training'
    WHEN 'Workout' THEN 'workout'
    ELSE 'unknown'
END
WHERE sport NOT IN (
    'alpine_ski',
    'hike',
    'ride',
    'run',
    'swim',
    'trail_run',
    'unknown',
    'virtual_ride',
    'virtual_run',
    'walk',
    'weight_training',
    'workout'
);

UPDATE activity_streams
SET metric_type = 'heart_rate'
WHERE metric_type = 'heartrate';

UPDATE user_integrations
SET source = 'intervals_icu'
WHERE source = 'intervals.icu';
"""

_UPSERT_SOURCE = sa.text("""
INSERT INTO source_definitions (
    source_key, display_name, aliases, adapter_only_aliases, input_metrics
) VALUES (:key, :display_name, CAST(:aliases AS jsonb), CAST(:adapter_only_aliases AS jsonb), CAST(:input_metrics AS jsonb))
ON CONFLICT (source_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    aliases = EXCLUDED.aliases,
    adapter_only_aliases = EXCLUDED.adapter_only_aliases,
    input_metrics = EXCLUDED.input_metrics
""")
_UPSERT_SPORT = sa.text("""
INSERT INTO sport_definitions (sport_key, display_name, family, aliases)
VALUES (:key, :display_name, :family, CAST(:aliases AS jsonb))
ON CONFLICT (sport_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    family = EXCLUDED.family,
    aliases = EXCLUDED.aliases
""")
_UPSERT_STREAM = sa.text("""
INSERT INTO stream_metric_definitions (
    metric_key, unit, display_unit, null_semantics, legal_min, legal_max, adapter_only_aliases
) VALUES (:key, :unit, :display_unit, :null_semantics, :legal_min, :legal_max, CAST(:adapter_only_aliases AS jsonb))
ON CONFLICT (metric_key) DO UPDATE SET
    unit = EXCLUDED.unit,
    display_unit = EXCLUDED.display_unit,
    null_semantics = EXCLUDED.null_semantics,
    legal_min = EXCLUDED.legal_min,
    legal_max = EXCLUDED.legal_max,
    adapter_only_aliases = EXCLUDED.adapter_only_aliases
""")
_UPSERT_METRIC = sa.text("""
INSERT INTO metric_definitions (
    metric_key, unit, display_unit, classification, materialization,
    null_semantics, legal_min, legal_max, ui_precision
) VALUES (
    :key, :unit, :display_unit, :classification, :materialization,
    :null_semantics, :legal_min, :legal_max, :ui_precision
)
ON CONFLICT (metric_key) DO UPDATE SET
    unit = EXCLUDED.unit,
    display_unit = EXCLUDED.display_unit,
    classification = EXCLUDED.classification,
    materialization = EXCLUDED.materialization,
    null_semantics = EXCLUDED.null_semantics,
    legal_min = EXCLUDED.legal_min,
    legal_max = EXCLUDED.legal_max,
    ui_precision = EXCLUDED.ui_precision,
    deprecated_at = NULL
""")


def upgrade() -> None:
    op.execute(_TABLES_SQL)
    op.execute(_ACTIVITY_SOURCE_COLUMNS_SQL)
    op.execute(_NORMALIZE_LEGACY_KEYS_SQL)
    bind = op.get_bind()
    bind.execute(_UPSERT_SOURCE, source_rows())
    bind.execute(_UPSERT_SPORT, sport_rows())
    bind.execute(_UPSERT_STREAM, stream_rows())
    bind.execute(_UPSERT_METRIC, metric_rows())
    op.execute(ACTIVITY_SUMMARY_CONSTRAINTS_SQL)
    op.execute(activity_stream_constraints_sql())
    op.execute(ACTIVITY_STREAM_INDEX_SQL)
    op.execute(WELLNESS_STRENGTH_STATUS_SQL)
    op.execute(SOURCE_STATUS_CONSTRAINTS_SQL)
    op.execute(DERIVED_FACT_BOUNDS_SQL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_derived_metric_fact_bounds ON derived_metric_facts")
    op.execute("DROP FUNCTION IF EXISTS enforce_derived_metric_fact_bounds()")
    for name, table in constraint_targets():
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
    op.execute("DROP INDEX IF EXISTS uq_activity_stream_identity")
    op.execute("DROP TABLE IF EXISTS stream_metric_definitions")
    op.execute("DROP TABLE IF EXISTS sport_definitions")
    op.execute("DROP TABLE IF EXISTS source_definitions")
