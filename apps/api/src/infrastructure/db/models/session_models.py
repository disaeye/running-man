from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    Double,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base


class SessionClassification(Base):
    __tablename__ = "session_classifications"
    __table_args__ = (
        PrimaryKeyConstraint("athlete_id", "activity_id"),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_session_classifications_confidence",
        ),
        Index("idx_session_classifications_day", "athlete_id", text("local_day DESC")),
    )

    athlete_id = Column(
        UUID(as_uuid=True), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    activity_id = Column(Text, nullable=False)
    local_day = Column(Date, nullable=False)
    structure = Column(Text, nullable=False)
    session_type = Column(Text, nullable=False)
    primary_stimulus = Column(Text, nullable=False)
    pacing_pattern = Column(Text, nullable=False)
    display_name = Column(Text, nullable=False)
    display_line = Column(Text, nullable=False)
    evidence_grade = Column(Text, nullable=False)
    confidence = Column(Double, nullable=False)
    classification = Column(JSONB, nullable=False)
    algorithm_version = Column(Text, nullable=False)
    computed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class ActivityInterval(Base):
    __tablename__ = "activity_intervals"
    __table_args__ = (PrimaryKeyConstraint("athlete_id", "activity_id"),)

    athlete_id = Column(
        UUID(as_uuid=True), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    activity_id = Column(Text, nullable=False)
    payload = Column(JSONB, nullable=False)
    fetched_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
