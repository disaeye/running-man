"""Allow race markers in generated training calendars.

Revision ID: a6b7c8d9e0f1
Revises: f5b6c7d8e9a0
Create Date: 2026-10-05
"""

from alembic import op

revision = "a6b7c8d9e0f1"
down_revision = "f5b6c7d8e9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_training_calendar_training_type", "training_calendar", type_="check"
    )
    op.create_check_constraint(
        "ck_training_calendar_training_type",
        "training_calendar",
        "training_type IS NULL OR training_type IN "
        "('easy', 'recovery', 'long', 'tempo', 'intervals', 'race')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE training_calendar SET training_type = NULL WHERE training_type = 'race'"
    )
    op.drop_constraint(
        "ck_training_calendar_training_type", "training_calendar", type_="check"
    )
    op.create_check_constraint(
        "ck_training_calendar_training_type",
        "training_calendar",
        "training_type IS NULL OR training_type IN "
        "('easy', 'recovery', 'long', 'tempo', 'intervals')",
    )
