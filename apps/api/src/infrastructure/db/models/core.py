from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Double,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

from infrastructure.db import Base
from infrastructure.db.models.athlete import Athlete, LoginAttempt, RevokedToken  # noqa: F401
from infrastructure.db.models.plan_entities import (  # noqa: F401
    Goal,
    Milestone,
    TrainingPhase,
    WebhookEvent,
)


class UserIntegration(Base):
    __tablename__ = "user_integrations"
    __table_args__ = (
        UniqueConstraint("athlete_id", "source"),
        Index("idx_integrations_athlete", "athlete_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    source = Column(String(50), nullable=False)
    connected = Column(Boolean, nullable=True, server_default=text("false"))
    credentials = Column(JSONB, nullable=True)
    settings = Column(JSONB, nullable=True, server_default=text("'{}'::jsonb"))
    last_sync_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_sync_status = Column(String(20), nullable=True)
    last_sync_error = Column(Text, nullable=True)
    last_sync_detail = Column(JSONB, nullable=True, server_default=text("'{}'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))


class HealthWellness(Base):
    __tablename__ = "health_wellness"
    __table_args__ = (
        PrimaryKeyConstraint("day", "athlete_id"),
        {"postgresql_partition_by": "RANGE (day)"},
    )

    day = Column(Date, nullable=False)
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    weight = Column(Double, nullable=True)
    resting_hr = Column(SmallInteger, nullable=True)
    hrv = Column(Double, nullable=True)
    hrv_sdnn = Column(Double, nullable=True)
    vo2max = Column(Double, nullable=True)
    steps = Column(Integer, nullable=True)
    sleep_secs = Column(Integer, nullable=True)
    sleep_score = Column(SmallInteger, nullable=True)
    sleep_quality = Column(SmallInteger, nullable=True)
    avg_sleeping_hr = Column(SmallInteger, nullable=True)
    spo2 = Column(SmallInteger, nullable=True)
    respiration_rate = Column(Double, nullable=True)
    systolic_bp = Column(SmallInteger, nullable=True)
    diastolic_bp = Column(SmallInteger, nullable=True)
    kcal_consumed = Column(Integer, nullable=True)
    carbs_g = Column(Double, nullable=True)
    protein_g = Column(Double, nullable=True)
    fat_g = Column(Double, nullable=True)
    hydration = Column(SmallInteger, nullable=True)
    body_fat_pct = Column(Double, nullable=True)
    menstrual_phase = Column(SmallInteger, nullable=True)
    menstrual_phase_predicted = Column(SmallInteger, nullable=True)
    fatigue = Column(SmallInteger, nullable=True)
    soreness = Column(SmallInteger, nullable=True)
    stress = Column(SmallInteger, nullable=True)
    mood = Column(SmallInteger, nullable=True)
    motivation = Column(SmallInteger, nullable=True)
    injury_status = Column(SmallInteger, nullable=True)
    readiness = Column(SmallInteger, nullable=True)
    comments = Column(Text, nullable=True)


class ActivitySummary(Base):
    __tablename__ = "activity_summary"
    __table_args__ = (
        PrimaryKeyConstraint("activity_id", "start_time"),
        {"postgresql_partition_by": "RANGE (start_time)"},
    )

    activity_id = Column(Text, nullable=False)
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    sport = Column(Text, nullable=False)
    distance_m = Column(Double, nullable=True)
    duration_s = Column(Integer, nullable=True)
    avg_hr = Column(SmallInteger, nullable=True)
    max_hr = Column(SmallInteger, nullable=True)
    avg_power = Column(SmallInteger, nullable=True)
    source_weighted_power_w = Column(Double, nullable=True)
    icu_ctl = Column(Double, nullable=True)
    source_training_load = Column(Double, nullable=True)
    avg_cadence = Column(Double, nullable=True)
    avg_speed = Column(Double, nullable=True)
    elevation_gain_m = Column(Double, nullable=True)
    calories = Column(Integer, nullable=True)
    device_name = Column(Text, nullable=True)
    external_id = Column(Text, nullable=True)
    source = Column(Text, nullable=True)
    file_type = Column(Text, nullable=True)
    source_hash = Column(String(64), nullable=True)
    raw_data = Column(JSONB, nullable=True)
    has_gps = Column(Boolean, nullable=True, server_default=text("false"))
    has_hr = Column(Boolean, nullable=True, server_default=text("false"))
    has_power = Column(Boolean, nullable=True, server_default=text("false"))
    has_cadence = Column(Boolean, nullable=True, server_default=text("false"))
    summary_polyline = Column(Text, nullable=True)
    weather_avg_temp = Column(Double, nullable=True)
    weather_min_temp = Column(Double, nullable=True)
    weather_max_temp = Column(Double, nullable=True)
    weather_feels_like = Column(Double, nullable=True)
    weather_wind_speed = Column(Double, nullable=True)
    weather_wind_gust = Column(Double, nullable=True)
    weather_wind_deg = Column(Double, nullable=True)
    weather_headwind_pct = Column(Double, nullable=True)
    weather_tailwind_pct = Column(Double, nullable=True)
    weather_clouds_pct = Column(Double, nullable=True)
    weather_max_rain = Column(Double, nullable=True)
    weather_max_snow = Column(Double, nullable=True)
    synced_at = Column(TIMESTAMP(timezone=True), nullable=True)
    streams_synced_at = Column(TIMESTAMP(timezone=True), nullable=True)
    stream_sample_count = Column(Integer, nullable=True, server_default="0")
    has_streams = Column(Boolean, nullable=True, server_default=text("false"))


# ActivityStream has no primary key (valid in PostgreSQL for time-series).
# Defined as a raw Table so it's visible to autogenerate without ORM
# requiring a PK.
activity_streams_t = Table(
    "activity_streams",
    Base.metadata,
    Column("sample_time", TIMESTAMP(timezone=True), nullable=False),
    Column("activity_id", Text, nullable=False),
    Column("athlete_id", UUID(as_uuid=True), nullable=False),
    Column("metric_type", Text, nullable=False),
    Column("value", Double, nullable=False),
    Column("lat", Double, nullable=True),
    Column("lon", Double, nullable=True),
    Column("alt", Double, nullable=True),
    postgresql_partition_by="RANGE (sample_time)",
)


class TrainingCalendar(Base):
    __tablename__ = "training_calendar"
    __table_args__ = (
        CheckConstraint(
            "training_type IS NULL OR training_type IN "
            "('easy', 'recovery', 'long', 'tempo', 'intervals', 'race')",
            name="ck_training_calendar_training_type",
        ),
        CheckConstraint(
            "plan_source IS NULL OR plan_source IN ('generator', 'intervals_icu', 'manual')",
            name="ck_training_calendar_plan_source",
        ),
        CheckConstraint(
            "completed_distance_m IS NULL OR completed_distance_m BETWEEN 0 AND 1000000",
            name="ck_training_calendar_completed_distance",
        ),
        CheckConstraint(
            "completed_duration_s IS NULL OR completed_duration_s BETWEEN 1 AND 172800",
            name="ck_training_calendar_completed_duration",
        ),
        CheckConstraint(
            "completed_avg_hr IS NULL OR completed_avg_hr BETWEEN 25 AND 260",
            name="ck_training_calendar_completed_avg_hr",
        ),
        CheckConstraint(
            "completed_rpe IS NULL OR completed_rpe BETWEEN 1 AND 10",
            name="ck_training_calendar_completed_rpe",
        ),
    )

    event_id = Column(Text, primary_key=True)
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    category = Column(Text, nullable=False)
    sport_type = Column(Text, nullable=True)
    name = Column(Text, nullable=True)
    workout_xml = Column(Text, nullable=True)
    predicted_tss = Column(Double, nullable=True)
    external_id = Column(Text, nullable=True)
    status = Column(Text, nullable=False, server_default="planned")
    done = Column(Boolean, nullable=False, server_default=text("false"))
    plan_goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.goal_id"), nullable=True)
    plan_source = Column(Text, nullable=True)
    training_type = Column(Text, nullable=True)
    workout_prescription = Column(JSONB, nullable=True)
    athlete_edited = Column(Boolean, nullable=False, server_default=text("false"))
    linked_activity_id = Column(Text, nullable=True)
    completed_distance_m = Column(Double, nullable=True)
    completed_duration_s = Column(Integer, nullable=True)
    completed_avg_hr = Column(SmallInteger, nullable=True)
    completed_rpe = Column(SmallInteger, nullable=True)
    actual_logged_at = Column(TIMESTAMP(timezone=True), nullable=True)


class ActivityRecomputeJob(Base):
    __tablename__ = "activity_recompute_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'failed', 'succeeded')",
            name="ck_activity_recompute_jobs_status",
        ),
        CheckConstraint("attempts >= 0", name="ck_activity_recompute_jobs_attempts"),
    )

    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), primary_key=True)
    status = Column(Text, nullable=False, server_default="pending")
    trigger = Column(Text, nullable=False)
    requested_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    available_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    generation = Column(Integer, nullable=False, server_default=text("1"))
    claimed_generation = Column(Integer, nullable=True)
    claimed_token = Column(UUID(as_uuid=True), nullable=True)
    attempts = Column(Integer, nullable=False, server_default=text("0"))
    claimed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    finished_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)


class AthleteThreshold(Base):
    """Time-versioned athlete thresholds (see domain.thresholds.resolver).

    Replaces the former ``ftp_history`` table, which carried ``lthr`` despite
    being named for a cycling metric, and left ``threshold_pace`` — the primary
    running threshold — with no history at all.
    """

    __tablename__ = "athlete_thresholds"
    __table_args__ = (PrimaryKeyConstraint("athlete_id", "effective_from"),)

    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    effective_from = Column(Date, nullable=False)
    hr_max = Column(Integer, nullable=True)
    resting_hr = Column(Integer, nullable=True)
    lthr = Column(Integer, nullable=True)
    threshold_pace = Column(Double, nullable=True)
    source = Column(Text, nullable=False, server_default="manual")
    algorithm_version = Column(Text, nullable=True)
    computation_run_id = Column(
        UUID(as_uuid=True), ForeignKey("computation_runs.id"), nullable=True
    )
