from sqlalchemy import (
    CheckConstraint,
    Column,
    Double,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base


class ComputationRun(Base):
    __tablename__ = "computation_runs"
    __table_args__ = (
        CheckConstraint(
            "length(btrim(computation_kind)) > 0",
            name="ck_computation_runs_kind_not_blank",
        ),
        CheckConstraint(
            "algorithm_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'",
            name="ck_computation_runs_algorithm_semver",
        ),
        CheckConstraint(
            "input_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_computation_runs_fingerprint_sha256",
        ),
        CheckConstraint(
            "length(btrim(trigger)) > 0",
            name="ck_computation_runs_trigger_not_blank",
        ),
        CheckConstraint(
            "status IN ('running', 'success', 'failed', 'skipped')",
            name="ck_computation_runs_status",
        ),
        CheckConstraint("rows_affected >= 0", name="ck_computation_runs_rows_affected"),
        CheckConstraint(
            "input_window_start IS NULL OR input_window_end IS NULL OR "
            "input_window_start <= input_window_end",
            name="ck_computation_runs_window",
        ),
        CheckConstraint(
            "jsonb_typeof(detail) = 'object'",
            name="ck_computation_runs_detail_object",
        ),
        Index(
            "idx_computation_runs_athlete_kind_started",
            "athlete_id",
            "computation_kind",
            text("started_at DESC"),
        ),
        Index(
            "uq_computation_runs_success_fingerprint",
            "athlete_id",
            "computation_kind",
            "algorithm_version",
            "input_fingerprint",
            unique=True,
            postgresql_where=text("status = 'success'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(
        UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
    )
    computation_kind = Column(Text, nullable=False)
    algorithm_version = Column(Text, nullable=False)
    input_fingerprint = Column(String(64), nullable=False)
    trigger = Column(Text, nullable=False)
    input_window_start = Column(TIMESTAMP(timezone=True), nullable=True)
    input_window_end = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Text, nullable=False, server_default="running")
    rows_affected = Column(Integer, nullable=False, server_default="0")
    started_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    finished_at = Column(TIMESTAMP(timezone=True), nullable=True)
    detail = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class MetricDefinition(Base):
    __tablename__ = "metric_definitions"
    __table_args__ = (
        UniqueConstraint("metric_key", "unit", name="uq_metric_definitions_key_unit"),
        CheckConstraint(
            "length(btrim(metric_key)) > 0",
            name="ck_metric_definitions_key_not_blank",
        ),
        CheckConstraint(
            "length(btrim(unit)) > 0",
            name="ck_metric_definitions_unit_not_blank",
        ),
        CheckConstraint("value_type = 'numeric'", name="ck_metric_definitions_value_type"),
        CheckConstraint(
            "legal_min IS NULL OR legal_max IS NULL OR legal_min <= legal_max",
            name="ck_metric_definitions_range",
        ),
        CheckConstraint("ui_precision >= 0", name="ck_metric_definitions_precision"),
        CheckConstraint(
            "category IN ('volume','load','load_balance','recovery','wellness_input',"
            "'ability','body','intensity','environment')",
            name="ck_metric_definitions_category",
        ),
        CheckConstraint(
            "jsonb_typeof(zones) = 'array'",
            name="ck_metric_definitions_zones_array",
        ),
        CheckConstraint(
            "aggregation IS NULL OR aggregation IN ('sum','avg','latest','max')",
            name="ck_metric_definitions_aggregation",
        ),
    )

    metric_key = Column(Text, primary_key=True)
    unit = Column(Text, nullable=False)
    display_name = Column(Text, nullable=False, server_default="")
    display_unit = Column(Text, nullable=False, server_default="")
    value_type = Column(Text, nullable=False, server_default="numeric")
    classification = Column(Text, nullable=False)
    category = Column(Text, nullable=False, server_default="")
    materialization = Column(Text, nullable=False)
    null_semantics = Column(Text, nullable=False)
    legal_min = Column(Double, nullable=True)
    legal_max = Column(Double, nullable=True)
    ui_precision = Column(SmallInteger, nullable=False, server_default="0")
    zones = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    note = Column(Text, nullable=False, server_default="")
    source_table = Column(Text, nullable=True)
    source_column = Column(Text, nullable=True)
    aggregation = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    deprecated_at = Column(TIMESTAMP(timezone=True), nullable=True)


class DerivedMetricFact(Base):
    __tablename__ = "derived_metric_facts"
    __table_args__ = (
        UniqueConstraint(
            "athlete_id",
            "subject_type",
            "subject_key",
            "metric_key",
            "effective_at",
            "algorithm_version",
            name="uq_derived_metric_fact_version",
        ),
        ForeignKeyConstraint(
            ["metric_key", "unit"],
            ["metric_definitions.metric_key", "metric_definitions.unit"],
            name="fk_derived_metric_facts_definition",
        ),
        CheckConstraint(
            "subject_type IN ('athlete', 'activity', 'day', 'sport_day')",
            name="ck_derived_metric_facts_subject_type",
        ),
        CheckConstraint(
            "length(btrim(subject_key)) > 0",
            name="ck_derived_metric_facts_subject_key",
        ),
        CheckConstraint(
            "algorithm_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'",
            name="ck_derived_metric_facts_algorithm_semver",
        ),
        CheckConstraint("length(btrim(method)) > 0", name="ck_derived_metric_facts_method"),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_derived_metric_facts_confidence",
        ),
        CheckConstraint(
            "jsonb_typeof(metadata) = 'object'",
            name="ck_derived_metric_facts_metadata_object",
        ),
        Index(
            "idx_derived_metric_facts_subject_time",
            "athlete_id",
            "subject_type",
            "subject_key",
            text("effective_at DESC"),
        ),
        Index(
            "idx_derived_metric_facts_metric_time",
            "athlete_id",
            "metric_key",
            text("effective_at DESC"),
        ),
        Index(
            "idx_derived_metric_facts_current_read",
            "athlete_id",
            "subject_type",
            "subject_key",
            "metric_key",
            text("effective_at DESC"),
            text("computed_at DESC"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(
        UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject_type = Column(Text, nullable=False)
    subject_key = Column(Text, nullable=False)
    metric_key = Column(Text, nullable=False)
    unit = Column(Text, nullable=False)
    value = Column(Double, nullable=False)
    effective_at = Column(TIMESTAMP(timezone=True), nullable=False)
    algorithm_version = Column(Text, nullable=False)
    computation_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("computation_runs.id"),
        nullable=False,
    )
    method = Column(Text, nullable=False)
    confidence = Column(Double, nullable=True)
    metric_metadata = Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    computed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
