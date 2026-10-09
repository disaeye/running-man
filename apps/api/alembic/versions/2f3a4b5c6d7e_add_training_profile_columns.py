"""add training profile columns to athletes

Adds hr_max, resting_hr, dob, sex, weight_goal,
weekly_training_days, max_session_duration_min, preferred_sport
to the athletes table.

Columns are added without DEFAULT so existing rows stay NULL
(nullable).  A second ALTER sets the DEFAULT for future inserts on
the three columns that have spec defaults.

Revision ID: 2f3a4b5c6d7e
Revises: 4fa4a6abea41
Create Date: 2026-06-17 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "2f3a4b5c6d7e"
down_revision: Union[str, Sequence[str], None] = "4fa4a6abea41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = [
    # (name, type_str)
    ("hr_max", "INTEGER"),
    ("resting_hr", "INTEGER"),
    ("dob", "DATE"),
    ("sex", "VARCHAR(1)"),
    ("weight_goal", "DOUBLE PRECISION"),
    ("weekly_training_days", "INTEGER"),
    ("max_session_duration_min", "INTEGER"),
    ("preferred_sport", "VARCHAR"),
]

# Columns that get a server default for future inserts (existing rows stay NULL)
_DEFAULTS: list[tuple[str, str]] = [
    ("weekly_training_days", "5"),
    ("max_session_duration_min", "120"),
    ("preferred_sport", "'Run'"),
]


def upgrade() -> None:
    for col_name, col_type in _COLUMNS:
        op.execute(f"ALTER TABLE athletes ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
    for col_name, default in _DEFAULTS:
        op.execute(f"ALTER TABLE athletes ALTER COLUMN {col_name} SET DEFAULT {default}")


def downgrade() -> None:
    for col_name, _ in reversed(_DEFAULTS):
        op.execute(f"ALTER TABLE athletes ALTER COLUMN {col_name} DROP DEFAULT")
    for col_name, _ in reversed(_COLUMNS):
        op.execute(f"ALTER TABLE athletes DROP COLUMN IF EXISTS {col_name}")
