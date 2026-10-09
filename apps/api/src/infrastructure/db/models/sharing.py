from sqlalchemy import Boolean, Column, Date, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, REAL, TIMESTAMP, UUID

from infrastructure.db import Base


class GearShoe(Base):
    __tablename__ = "gear_shoes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    name = Column(Text, nullable=False)
    brand = Column(Text, nullable=True)
    model = Column(Text, nullable=True)
    purchase_date = Column(Date, nullable=True)
    current_mileage_m = Column(REAL, nullable=True, server_default="0")
    retired_at = Column(TIMESTAMP(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))


class GearAssignment(Base):
    __tablename__ = "gear_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    activity_id = Column(Text, nullable=False)
    shoe_id = Column(
        UUID(as_uuid=True),
        ForeignKey("gear_shoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))


class ShareToken(Base):
    __tablename__ = "share_tokens"

    token = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    activity_id = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)


class NotificationRule(Base):
    __tablename__ = "notification_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    rule_type = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=True, server_default=text("true"))
    last_fired_at = Column(TIMESTAMP(timezone=True), nullable=True)
    config = Column(JSONB, nullable=True, server_default=text("'{}'::jsonb"))
