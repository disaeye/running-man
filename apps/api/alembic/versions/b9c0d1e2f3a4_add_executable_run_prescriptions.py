"""Add structured run prescriptions and manual completion fields.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-09-16
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_calendar", sa.Column("plan_goal_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column("training_calendar", sa.Column("plan_source", sa.Text(), nullable=True))
    op.add_column("training_calendar", sa.Column("training_type", sa.Text(), nullable=True))
    op.add_column(
        "training_calendar", sa.Column("workout_prescription", postgresql.JSONB(), nullable=True)
    )
    op.add_column(
        "training_calendar",
        sa.Column("athlete_edited", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("training_calendar", sa.Column("linked_activity_id", sa.Text(), nullable=True))
    op.add_column(
        "training_calendar", sa.Column("completed_distance_m", sa.Double(), nullable=True)
    )
    op.add_column(
        "training_calendar", sa.Column("completed_duration_s", sa.Integer(), nullable=True)
    )
    op.add_column(
        "training_calendar", sa.Column("completed_avg_hr", sa.SmallInteger(), nullable=True)
    )
    op.add_column("training_calendar", sa.Column("completed_rpe", sa.SmallInteger(), nullable=True))
    op.add_column(
        "training_calendar",
        sa.Column("actual_logged_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_training_calendar_plan_goal",
        "training_calendar",
        "goals",
        ["plan_goal_id"],
        ["goal_id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_training_calendar_generated_future",
        "training_calendar",
        ["athlete_id", "plan_goal_id", "start_time"],
        postgresql_where=sa.text("plan_source = 'generator' AND status = 'planned'"),
    )


def downgrade() -> None:
    op.drop_index("idx_training_calendar_generated_future", table_name="training_calendar")
    op.drop_constraint("fk_training_calendar_plan_goal", "training_calendar", type_="foreignkey")
    for column in (
        "actual_logged_at",
        "completed_rpe",
        "completed_avg_hr",
        "completed_duration_s",
        "completed_distance_m",
        "linked_activity_id",
        "athlete_edited",
        "workout_prescription",
        "training_type",
        "plan_source",
        "plan_goal_id",
    ):
        op.drop_column("training_calendar", column)
