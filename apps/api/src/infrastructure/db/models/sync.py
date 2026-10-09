from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base


class IntegrationSyncRun(Base):
    __tablename__ = "integration_sync_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'success', 'failed', 'skipped')",
            name="ck_integration_sync_runs_status",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    source = Column(Text, nullable=False)
    trigger = Column(Text, nullable=False, server_default="manual")
    window_start = Column(Date, nullable=True)
    window_end = Column(Date, nullable=True)
    started_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    finished_at = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Text, nullable=False, server_default="running")
    activities_seen = Column(Integer, nullable=True, server_default="0")
    activities_upserted = Column(Integer, nullable=True, server_default="0")
    activities_deduplicated = Column(Integer, nullable=True, server_default="0")
    wellness_seen = Column(Integer, nullable=True, server_default="0")
    streams_inserted = Column(Integer, nullable=True, server_default="0")
    errors_count = Column(Integer, nullable=True, server_default="0")
    error_summary = Column(Text, nullable=True)
    detail = Column(JSONB, nullable=True, server_default=text("'{}'::jsonb"))


class IntegrationSyncError(Base):
    __tablename__ = "integration_sync_errors"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    sync_run_id = Column(UUID(as_uuid=True), ForeignKey("integration_sync_runs.id"), nullable=False)
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    source = Column(Text, nullable=False)
    entity_type = Column(Text, nullable=False)
    source_record_id = Column(Text, nullable=True)
    activity_id = Column(Text, nullable=True)
    error_code = Column(Text, nullable=True)
    message = Column(Text, nullable=False)
    retryable = Column(Boolean, nullable=True, server_default=text("true"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class SourceRecord(Base):
    __tablename__ = "source_records"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'rejected', 'ignored')",
            name="ck_source_records_status",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    source = Column(Text, nullable=False)
    entity_type = Column(Text, nullable=False)
    source_record_id = Column(Text, nullable=False)
    source_updated_at = Column(TIMESTAMP(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=False)
    payload_hash = Column(Text, nullable=False)
    first_seen_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    sync_run_id = Column(UUID(as_uuid=True), ForeignKey("integration_sync_runs.id"), nullable=True)
    status = Column(Text, nullable=False, server_default="active")
