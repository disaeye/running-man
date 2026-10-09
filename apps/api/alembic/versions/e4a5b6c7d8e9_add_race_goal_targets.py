"""Store explicit race distance and target completion time.

Revision ID: e4a5b6c7d8e9
Revises: d2e3f4a5b6c7
Create Date: 2026-10-05
"""

import sqlalchemy as sa

from alembic import op

revision = "e4a5b6c7d8e9"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("race_distance_m", sa.Double(), nullable=True))
    op.add_column("goals", sa.Column("race_target_time_s", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_goals_race_distance_m",
        "goals",
        "race_distance_m IS NULL OR race_distance_m BETWEEN 1500 AND 1000000",
    )
    op.create_check_constraint(
        "ck_goals_race_target_time_s",
        "goals",
        "race_target_time_s IS NULL OR race_target_time_s BETWEEN 180 AND 172800",
    )


def downgrade() -> None:
    op.drop_constraint("ck_goals_race_target_time_s", "goals", type_="check")
    op.drop_constraint("ck_goals_race_distance_m", "goals", type_="check")
    op.drop_column("goals", "race_target_time_s")
    op.drop_column("goals", "race_distance_m")
