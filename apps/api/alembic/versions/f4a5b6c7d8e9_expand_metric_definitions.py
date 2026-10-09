"""expand metric_definitions with semantic metadata columns

Revision ID: f4a5b6c7d8e9
Revises: a4b5c6d7e8f9
Create Date: 2026-08-10 00:00:00

Adds ``display_name``, ``category``, ``zones``, ``note``, ``source_table``,
``source_column``, ``aggregation`` to ``metric_definitions`` so the table
becomes the complete metric metadata centre — not just an FK target for
legal-range enforcement, but also the source of display labels, semantic
zones, and declarative wide-column→EAV mapping instructions.

All new columns have defaults (empty string / empty array / NULL), so
existing rows survive without backfill. The accompanying resync migration
``f5a6b7c8d9e0`` upserts the current registry values into the new columns.

A ``readiness_bands`` seed table is also created — it stores the generated
readiness band definitions (score→level→label→color→intensity) so both
back-end and front-end can read thresholds from a single source.
"""

import sqlalchemy as sa

from alembic import op

revision = "f4a5b6c7d8e9"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "metric_definitions",
        sa.Column("display_name", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("category", sa.Text(), nullable=False, server_default="volume"),
    )
    op.add_column(
        "metric_definitions",
        sa.Column(
            "zones",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("source_table", sa.Text(), nullable=True),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("source_column", sa.Text(), nullable=True),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("aggregation", sa.Text(), nullable=True),
    )

    # ``category`` is added above with a server default that is itself a legal
    # member of the CHECK below: pre-existing rows are backfilled with that
    # value by ``ADD COLUMN``, so the constraint validates immediately. The
    # companion migration ``f5a6b7c8d9e0`` then upserts the real per-metric
    # categories from the generated registry.
    op.create_check_constraint(
        "ck_metric_definitions_category",
        "metric_definitions",
        "category IN ('volume','load','load_balance','recovery','wellness_input',"
        "'ability','body','intensity','environment')",
    )
    op.create_check_constraint(
        "ck_metric_definitions_zones_array",
        "metric_definitions",
        "jsonb_typeof(zones) = 'array'",
    )
    op.create_check_constraint(
        "ck_metric_definitions_aggregation",
        "metric_definitions",
        "aggregation IS NULL OR aggregation IN ('sum','avg','latest','max')",
    )

    op.create_table(
        "readiness_bands",
        sa.Column("min_score", sa.SmallInteger(), nullable=False),
        sa.Column("level", sa.Text(), primary_key=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("max_intensity", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "min_score >= 0 AND min_score <= 100",
            name="ck_readiness_bands_min_score",
        ),
        sa.CheckConstraint(
            "level IN ('high','moderate','recovery','rest')",
            name="ck_readiness_bands_level",
        ),
        sa.CheckConstraint(
            "max_intensity IN ('high','moderate','low','none')",
            name="ck_readiness_bands_intensity",
        ),
        sa.CheckConstraint(
            "color IN ('good','moderate','poor')",
            name="ck_readiness_bands_color",
        ),
    )


def downgrade() -> None:
    op.drop_table("readiness_bands")
    op.drop_constraint("ck_metric_definitions_aggregation", "metric_definitions")
    op.drop_constraint("ck_metric_definitions_zones_array", "metric_definitions")
    op.drop_constraint("ck_metric_definitions_category", "metric_definitions")
    op.drop_column("metric_definitions", "aggregation")
    op.drop_column("metric_definitions", "source_column")
    op.drop_column("metric_definitions", "source_table")
    op.drop_column("metric_definitions", "note")
    op.drop_column("metric_definitions", "zones")
    op.drop_column("metric_definitions", "category")
    op.drop_column("metric_definitions", "display_name")
