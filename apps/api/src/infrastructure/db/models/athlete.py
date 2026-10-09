from sqlalchemy import Column, Date, Double, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base


class Athlete(Base):
    __tablename__ = "athletes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    name = Column(Text, nullable=False, server_default="")
    timezone = Column(Text, nullable=False, server_default="UTC")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    hr_max = Column(Integer, nullable=True)
    resting_hr = Column(Integer, nullable=True)
    dob = Column(Date, nullable=True)
    sex = Column(String(1), nullable=True)
    weight_goal = Column(Double, nullable=True)
    weekly_training_days = Column(Integer, nullable=True, server_default="5")
    max_session_duration_min = Column(Integer, nullable=True, server_default="120")
    preferred_sport = Column(String, nullable=True, server_default="Run")
    notification_prefs = Column(JSONB, nullable=True, server_default=text("'{}'::jsonb"))
    lthr = Column(Integer, nullable=True)
    threshold_pace = Column(Double, nullable=True)
    physiology_updated_at = Column(TIMESTAMP(timezone=True), nullable=True)
    physiology_computation_run_id = Column(
        UUID(as_uuid=True), ForeignKey("computation_runs.id"), nullable=True
    )
    physiology_algorithm_version = Column(Text, nullable=True)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti = Column(Text, primary_key=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    ip = Column(Text, primary_key=True)
    failed_count = Column(Integer, nullable=False, server_default="0")
    last_attempt = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    locked_until = Column(TIMESTAMP(timezone=True), nullable=True)
