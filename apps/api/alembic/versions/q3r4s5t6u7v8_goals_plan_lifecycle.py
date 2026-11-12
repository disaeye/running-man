"""goals plan lifecycle

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-11-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "q3r4s5t6u7v8"
down_revision: str | Sequence[str] | None = "p2q3r4s5t6u7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UPGRADE_SQL = """
ALTER TABLE goals
    ADD COLUMN direction VARCHAR NOT NULL DEFAULT 'increase',
    ADD COLUMN start_date DATE,
    ADD COLUMN sport_key VARCHAR REFERENCES sport_definitions(sport_key),
    ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN baseline_value DOUBLE PRECISION,
    ADD COLUMN race_actual_time_s INTEGER,
    ADD COLUMN race_activity_id VARCHAR;

ALTER TABLE goals
    ADD CONSTRAINT ck_goals_type
        CHECK (type IN ('event', 'distance', 'time', 'weight', 'consistency')) NOT VALID;
ALTER TABLE goals
    ADD CONSTRAINT ck_goals_direction
        CHECK (direction IN ('increase', 'decrease')) NOT VALID;

CREATE UNIQUE INDEX uq_goals_one_primary
    ON goals (athlete_id) WHERE is_primary AND status = 'active';

-- 存量回填：体重的方向向下，累计类从创建日起算，运动类别默认跑步。
UPDATE goals SET direction = 'decrease' WHERE type = 'weight';
UPDATE goals SET start_date = created_at::date WHERE start_date IS NULL;
UPDATE goals SET sport_key = 'run'
    WHERE type IN ('distance', 'time', 'consistency') AND sport_key IS NULL;
UPDATE goals SET unit = '天' WHERE type = 'consistency' AND unit IN ('次', '周');

CREATE TABLE plan_revisions (
    revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    reason VARCHAR NOT NULL,
    events JSONB NOT NULL,
    phases JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_revisions_goal
    ON plan_revisions (athlete_id, goal_id, created_at DESC);

ALTER TABLE training_calendar
    ADD COLUMN revision_id UUID REFERENCES plan_revisions(revision_id);

ALTER TABLE milestones
    ADD COLUMN phase_id UUID REFERENCES training_phases(phase_id);
"""

_DOWNGRADE_SQL = """
ALTER TABLE milestones DROP COLUMN IF EXISTS phase_id;
ALTER TABLE training_calendar DROP COLUMN IF EXISTS revision_id;
DROP TABLE IF EXISTS plan_revisions;

DROP INDEX IF EXISTS uq_goals_one_primary;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS ck_goals_direction;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS ck_goals_type;
ALTER TABLE goals
    DROP COLUMN IF EXISTS race_activity_id,
    DROP COLUMN IF EXISTS race_actual_time_s,
    DROP COLUMN IF EXISTS baseline_value,
    DROP COLUMN IF EXISTS is_primary,
    DROP COLUMN IF EXISTS sport_key,
    DROP COLUMN IF EXISTS start_date,
    DROP COLUMN IF EXISTS direction;

-- weight_goal 列在升级时被 goals 表接替；降级时按现存 active 体重目标回填。
ALTER TABLE athletes ADD COLUMN weight_goal DOUBLE PRECISION;
UPDATE athletes a SET weight_goal = sub.target_value
FROM (
    SELECT DISTINCT ON (athlete_id) athlete_id, target_value
    FROM goals WHERE type = 'weight' AND status = 'active'
    ORDER BY athlete_id, updated_at DESC
) AS sub
WHERE a.id = sub.athlete_id;
"""


_WEIGHT_GOAL_MIGRATION_SQL = """
INSERT INTO goals (
    athlete_id, type, title, target_value, current_value, unit,
    status, direction, start_date, baseline_value, created_at, updated_at
)
SELECT
    a.id, 'weight', '体重目标', a.weight_goal,
    COALESCE(latest.weight, a.weight_goal), 'kg',
    'active', 'decrease', CURRENT_DATE,
    COALESCE(earliest.weight, latest.weight, a.weight_goal),
    now(), now()
FROM athletes a
LEFT JOIN LATERAL (
    SELECT weight FROM health_wellness hw
    WHERE hw.athlete_id = a.id AND hw.weight IS NOT NULL
    ORDER BY day DESC LIMIT 1
) AS latest ON true
LEFT JOIN LATERAL (
    SELECT weight FROM health_wellness hw
    WHERE hw.athlete_id = a.id AND hw.weight IS NOT NULL
    ORDER BY day ASC LIMIT 1
) AS earliest ON true
WHERE a.weight_goal IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM goals g
      WHERE g.athlete_id = a.id AND g.type = 'weight' AND g.status = 'active'
  )
"""

_DROP_WEIGHT_GOAL_COLUMN_SQL = "ALTER TABLE athletes DROP COLUMN weight_goal"


def _migrate_weight_goals() -> None:
    """athletes.weight_goal 转写为一条 active 体重目标，然后删除该列。

    基线取最早一条体重记录；没有记录时退回目标值本身。
    """
    op.execute(_WEIGHT_GOAL_MIGRATION_SQL)
    op.execute(_DROP_WEIGHT_GOAL_COLUMN_SQL)


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)
    _migrate_weight_goals()


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
