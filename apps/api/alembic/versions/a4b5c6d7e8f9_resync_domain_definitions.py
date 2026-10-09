"""resync canonical domain definition tables from the current registry

Revision ID: a4b5c6d7e8f9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-05 00:00:00

``d8e9f0a1b2c3`` seeded ``source_definitions`` / ``sport_definitions`` /
``stream_metric_definitions`` / ``metric_definitions`` from the generated
contract registry (``domain/generated``). Databases advanced before the
registry grew are missing the newer rows (e.g. production lacks
``aerobic_decoupling_pct``, ``efficiency_factor``, ``gap_avg``,
``normalized_graded_pace``, ``rtss``, ``vdot``), because a migration does not
re-run. This migration re-upserts all four tables from the current registry
— idempotent (``ON CONFLICT DO UPDATE``), a refresh on fresh databases and a
backfill on older ones.
"""

import sqlalchemy as sa

from alembic import op
from infrastructure.db.domain_constraints import metric_rows, source_rows, sport_rows, stream_rows

revision = "a4b5c6d7e8f9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None

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
    bind = op.get_bind()
    bind.execute(_UPSERT_SOURCE, source_rows())
    bind.execute(_UPSERT_SPORT, sport_rows())
    bind.execute(_UPSERT_STREAM, stream_rows())
    bind.execute(_UPSERT_METRIC, metric_rows())


def downgrade() -> None:
    # Definitions are additive; there is no safe inverse.
    pass
