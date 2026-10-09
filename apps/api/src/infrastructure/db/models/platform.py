"""Platform ORM models — tables from 002_platform_tables.sql.

Workout templates, zone overrides, activity laps, and notifications.
"""

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"

    template_id = Column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=True)
    name = Column(Text, nullable=False)
    sport = Column(String(50), nullable=False, server_default="Run")
    goal_type = Column(String(50), nullable=True)
    segments = Column(JSONB, nullable=True)
    predicted_tss = Column(Float, nullable=True)
    source = Column(String(20), nullable=False, server_default="user")
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))


class ZoneOverride(Base):
    __tablename__ = "zone_overrides"
    __table_args__ = (Index("idx_zone_overrides_athlete", "athlete_id"),)

    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), primary_key=True)
    metric = Column(String(10), primary_key=True)
    zone = Column(SmallInteger, primary_key=True)
    min_pct = Column(Float, nullable=False)
    max_pct = Column(Float, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))


class ActivityLap(Base):
    __tablename__ = "activity_laps"

    lap_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    activity_id = Column(Text, nullable=False)
    athlete_id = Column(UUID(as_uuid=True), nullable=False)
    lap_index = Column(Integer, nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=True)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    distance_m = Column(Float, nullable=True)
    duration_s = Column(Integer, nullable=True)
    avg_hr = Column(SmallInteger, nullable=True)
    max_hr = Column(SmallInteger, nullable=True)
    avg_power = Column(SmallInteger, nullable=True)
    np = Column(Float, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    type = Column(String(50), nullable=False)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=True)
    severity = Column(String(20), nullable=True, server_default="info")
    read = Column(Boolean, nullable=True, server_default=text("false"))
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
