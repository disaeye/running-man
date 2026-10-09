"""goals schema

Revision ID: 9b1d3c7e8f20
Revises: 7e8d9a0b1c2d
Create Date: 2026-06-17 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "9b1d3c7e8f20"
down_revision: Union[str, Sequence[str], None] = "7e8d9a0b1c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS goals (
    goal_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id    UUID NOT NULL REFERENCES athletes(id),
    type          VARCHAR NOT NULL,
    title         TEXT NOT NULL,
    target_value  DOUBLE PRECISION,
    current_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit          VARCHAR,
    target_date   DATE,
    status        VARCHAR NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS milestones (
    milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id      UUID NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    target_date  DATE,
    target_value DOUBLE PRECISION,
    achieved     BOOLEAN NOT NULL DEFAULT false,
    achieved_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS training_phases (
    phase_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id           UUID NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    name              VARCHAR NOT NULL,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    target_weekly_tss DOUBLE PRECISION
);
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_goals_athlete
    ON goals (athlete_id, status);
CREATE INDEX IF NOT EXISTS idx_milestones_goal
    ON milestones (goal_id, target_date);
"""


def upgrade() -> None:
    op.execute(_TABLES_SQL)
    op.execute(_INDEXES_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_milestones_goal")
    op.execute("DROP INDEX IF EXISTS idx_goals_athlete")
    op.execute("DROP TABLE IF EXISTS training_phases")
    op.execute("DROP TABLE IF EXISTS milestones")
    op.execute("DROP TABLE IF EXISTS goals")
