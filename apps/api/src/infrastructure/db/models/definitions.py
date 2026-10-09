from sqlalchemy import CheckConstraint, Column, Double, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP

from infrastructure.db import Base


class SourceDefinition(Base):
    __tablename__ = "source_definitions"
    __table_args__ = (
        CheckConstraint("length(btrim(source_key)) > 0", name="ck_source_definitions_key"),
        CheckConstraint(
            "jsonb_typeof(aliases) = 'array' "
            "AND jsonb_typeof(adapter_only_aliases) = 'array' "
            "AND jsonb_typeof(input_metrics) = 'array'",
            name="ck_source_definitions_arrays",
        ),
    )

    source_key = Column(Text, primary_key=True)
    display_name = Column(Text, nullable=False)
    aliases = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    adapter_only_aliases = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    input_metrics = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class SportDefinition(Base):
    __tablename__ = "sport_definitions"
    __table_args__ = (
        CheckConstraint("length(btrim(sport_key)) > 0", name="ck_sport_definitions_key"),
        CheckConstraint(
            "jsonb_typeof(aliases) = 'array'",
            name="ck_sport_definitions_aliases",
        ),
    )

    sport_key = Column(Text, primary_key=True)
    display_name = Column(Text, nullable=False)
    family = Column(Text, nullable=False)
    aliases = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class StreamMetricDefinition(Base):
    __tablename__ = "stream_metric_definitions"
    __table_args__ = (
        UniqueConstraint(
            "metric_key",
            "unit",
            name="uq_stream_metric_definitions_key_unit",
        ),
        CheckConstraint(
            "length(btrim(metric_key)) > 0",
            name="ck_stream_metric_definitions_key",
        ),
        CheckConstraint(
            "length(btrim(unit)) > 0",
            name="ck_stream_metric_definitions_unit",
        ),
        CheckConstraint("legal_min <= legal_max", name="ck_stream_metric_definitions_range"),
        CheckConstraint(
            "jsonb_typeof(adapter_only_aliases) = 'array'",
            name="ck_stream_metric_definitions_aliases",
        ),
    )

    metric_key = Column(Text, primary_key=True)
    unit = Column(Text, nullable=False)
    display_unit = Column(Text, nullable=False, server_default="")
    null_semantics = Column(Text, nullable=False)
    legal_min = Column(Double, nullable=False)
    legal_max = Column(Double, nullable=False)
    adapter_only_aliases = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
