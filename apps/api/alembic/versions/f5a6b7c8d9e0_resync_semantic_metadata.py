"""resync metric definitions with semantic metadata and seed readiness bands

Revision ID: f5a6b7c8d9e0
Revises: f4a5b6c7d8e9
Create Date: 2026-08-10 00:01:00

Companion to ``f4a5b6c7d8e9``. Upserts all ``metric_definitions`` rows with
the new semantic columns (``display_name``, ``category``, ``zones``,
``note``, ``source_table``, ``source_column``, ``aggregation``) from the
current generated registry, and seeds the ``readiness_bands`` table from
the generated readiness band definitions.

Idempotent — ``ON CONFLICT DO UPDATE``.
"""

import sqlalchemy as sa

from alembic import op
from domain.generated.readiness_bands import READINESS_BANDS
from infrastructure.db.domain_constraints import metric_rows

revision = "f5a6b7c8d9e0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None

_UPSERT_METRIC = sa.text("""
INSERT INTO metric_definitions (
    metric_key, unit, display_name, display_unit, classification, category,
    materialization, null_semantics, legal_min, legal_max, ui_precision,
    zones, note, source_table, source_column, aggregation
) VALUES (
    :key, :unit, :display_name, :display_unit, :classification, :category,
    :materialization, :null_semantics, :legal_min, :legal_max, :ui_precision,
    CAST(:zones AS jsonb), :note, :source_table, :source_column, :aggregation
)
ON CONFLICT (metric_key) DO UPDATE SET
    unit = EXCLUDED.unit,
    display_name = EXCLUDED.display_name,
    display_unit = EXCLUDED.display_unit,
    classification = EXCLUDED.classification,
    category = EXCLUDED.category,
    materialization = EXCLUDED.materialization,
    null_semantics = EXCLUDED.null_semantics,
    legal_min = EXCLUDED.legal_min,
    legal_max = EXCLUDED.legal_max,
    ui_precision = EXCLUDED.ui_precision,
    zones = EXCLUDED.zones,
    note = EXCLUDED.note,
    source_table = EXCLUDED.source_table,
    source_column = EXCLUDED.source_column,
    aggregation = EXCLUDED.aggregation,
    deprecated_at = NULL
""")

_UPSERT_READINESS_BAND = sa.text("""
INSERT INTO readiness_bands (min_score, level, label, max_intensity, color, recommendation)
VALUES (:min_score, :level, :label, :max_intensity, :color, :recommendation)
ON CONFLICT (level) DO UPDATE SET
    min_score = EXCLUDED.min_score,
    label = EXCLUDED.label,
    max_intensity = EXCLUDED.max_intensity,
    color = EXCLUDED.color,
    recommendation = EXCLUDED.recommendation,
    updated_at = now()
""")


def _readiness_band_rows() -> list[dict[str, object]]:
    return [
        {
            "min_score": int(band["min_score"]),
            "level": str(band["level"]),
            "label": str(band["label"]),
            "max_intensity": str(band["max_intensity"]),
            "color": str(band["color"]),
            "recommendation": str(band["recommendation"]),
        }
        for band in READINESS_BANDS
    ]


def upgrade() -> None:
    bind = op.get_bind()
    # ``metric_rows()`` already returns ``zones`` as a JSON-encoded string
    # (see ``domain_constraints.metric_rows``), and the upsert below casts it
    # with ``CAST(:zones AS jsonb)``. Encoding a second time here would store a
    # JSON *string* instead of an array and violate
    # ``ck_metric_definitions_zones_array``.
    bind.execute(_UPSERT_METRIC, metric_rows())
    bind.execute(_UPSERT_READINESS_BAND, _readiness_band_rows())


def downgrade() -> None:
    pass
