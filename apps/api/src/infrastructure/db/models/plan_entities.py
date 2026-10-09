from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Double,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID

from infrastructure.db import Base


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    event_key = Column(Text, primary_key=True)
    event_type = Column(Text, nullable=False)
    athlete_id = Column(Text, nullable=True)
    received_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint(
            "race_distance_m IS NULL OR race_distance_m BETWEEN 1500 AND 1000000",
            name="ck_goals_race_distance_m",
        ),
        CheckConstraint(
            "race_target_time_s IS NULL OR race_target_time_s BETWEEN 180 AND 172800",
            name="ck_goals_race_target_time_s",
        ),
    )

    goal_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(Text, nullable=False)
    target_value = Column(Double, nullable=True)
    current_value = Column(Double, nullable=False, server_default="0")
    unit = Column(String, nullable=True)
    target_date = Column(Date, nullable=True)
    race_distance_m = Column(Double, nullable=True)
    race_target_time_s = Column(Integer, nullable=True)
    status = Column(String, nullable=False, server_default="active")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class Milestone(Base):
    __tablename__ = "milestones"

    milestone_id = Column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    goal_id = Column(
        UUID(as_uuid=True), ForeignKey("goals.goal_id", ondelete="CASCADE"), nullable=False
    )
    title = Column(Text, nullable=False)
    target_date = Column(Date, nullable=True)
    target_value = Column(Double, nullable=True)
    achieved = Column(Boolean, nullable=False, server_default=text("false"))
    achieved_at = Column(TIMESTAMP(timezone=True), nullable=True)


class TrainingPhase(Base):
    __tablename__ = "training_phases"

    phase_id = Column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    goal_id = Column(
        UUID(as_uuid=True), ForeignKey("goals.goal_id", ondelete="CASCADE"), nullable=False
    )
    athlete_id = Column(
        UUID(as_uuid=True), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    target_weekly_tss = Column(Double, nullable=True)
