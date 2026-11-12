"""计算任务与阈值历史：活动补算队列和按日期版本的运动员阈值。"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    Double,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID

from infrastructure.db import Base


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
