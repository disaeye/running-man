"""Create a durable, coalescing activity recompute queue.

Revision ID: b1c2d3e4f5b7
Revises: a6b7c8d9e0f1
Create Date: 2026-10-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b1c2d3e4f5b7"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_recompute_jobs",
        sa.Column("athlete_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column(
            "requested_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "available_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("generation", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("claimed_generation", sa.Integer(), nullable=True),
        sa.Column("claimed_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("claimed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("finished_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'failed', 'succeeded')",
            name="ck_activity_recompute_jobs_status",
        ),
        sa.CheckConstraint("attempts >= 0", name="ck_activity_recompute_jobs_attempts"),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("athlete_id", name="pk_activity_recompute_jobs"),
    )
    op.create_index(
        "idx_activity_recompute_jobs_pending",
        "activity_recompute_jobs",
        ["requested_at", "athlete_id"],
        postgresql_where=sa.text("status IN ('pending', 'failed')"),
    )
    op.create_index(
        "idx_activity_recompute_jobs_stale_running",
        "activity_recompute_jobs",
        ["claimed_at"],
        postgresql_where=sa.text("status = 'running'"),
    )


def downgrade() -> None:
    op.drop_index(
        "idx_activity_recompute_jobs_stale_running", table_name="activity_recompute_jobs"
    )
    op.drop_index("idx_activity_recompute_jobs_pending", table_name="activity_recompute_jobs")
    op.drop_table("activity_recompute_jobs")
