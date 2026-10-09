"""Associate training phases with their athlete and retain their goal key.

Revision ID: f5b6c7d8e9a0
Revises: e4a5b6c7d8e9
Create Date: 2026-10-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "f5b6c7d8e9a0"
down_revision = "e4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("training_phases", sa.Column("athlete_id", postgresql.UUID(as_uuid=True)))
    op.execute(
        "UPDATE training_phases AS phases SET athlete_id = goals.athlete_id "
        "FROM goals WHERE goals.goal_id = phases.goal_id"
    )
    op.alter_column("training_phases", "athlete_id", nullable=False)
    op.create_foreign_key(
        "fk_training_phases_athlete",
        "training_phases",
        "athletes",
        ["athlete_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "idx_training_phases_athlete_goal_dates",
        "training_phases",
        ["athlete_id", "goal_id", "start_date", "end_date"],
    )


def downgrade() -> None:
    op.drop_index("idx_training_phases_athlete_goal_dates", table_name="training_phases")
    op.drop_constraint("fk_training_phases_athlete", "training_phases", type_="foreignkey")
    op.drop_column("training_phases", "athlete_id")
