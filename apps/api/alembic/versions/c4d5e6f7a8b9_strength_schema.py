"""strength schema

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-06-22 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS exercise_library (
    id SERIAL PRIMARY KEY,
    name_cn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    category TEXT NOT NULL,
    primary_muscles TEXT[] NOT NULL,
    secondary_muscles TEXT[],
    equipment TEXT,
    movement_pattern TEXT,
    instructions TEXT,
    common_mistakes TEXT,
    difficulty TEXT DEFAULT 'intermediate',
    UNIQUE (name_en)
);

CREATE TABLE IF NOT EXISTS workout_exercises (
    id SERIAL PRIMARY KEY,
    activity_id TEXT NOT NULL,
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    exercise_id INTEGER REFERENCES exercise_library(id),
    order_index INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_sets (
    id SERIAL PRIMARY KEY,
    workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    set_number INTEGER NOT NULL,
    weight_kg NUMERIC(6,2),
    reps INTEGER NOT NULL,
    rpe NUMERIC(3,1),
    set_type TEXT DEFAULT 'working',
    rest_seconds INTEGER,
    completed BOOLEAN DEFAULT TRUE,
    estimated_1rm_kg NUMERIC(6,2),
    created_at TIMESTAMPTZ DEFAULT now()
);
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_workout_exercises_activity ON workout_exercises (activity_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets (workout_exercise_id);
"""

_UPSERT_SQL = sa.text("""
INSERT INTO exercise_library (
    name_cn, name_en, category, primary_muscles, secondary_muscles, equipment,
    movement_pattern, instructions, common_mistakes, difficulty
) VALUES (
    :name_cn, :name_en, :category, :primary_muscles, :secondary_muscles, :equipment,
    :movement_pattern, :instructions, :common_mistakes, :difficulty
)
ON CONFLICT (name_en) DO NOTHING
""")

_EXERCISES = [
    ("深蹲", "Squat", "腿", ["股四头肌", "臀大肌"], ["腘绳肌", "核心"], "杠铃", "蹲"),
    ("卧推", "Bench Press", "胸", ["胸大肌", "肱三头肌"], ["三角肌前束"], "杠铃", "推"),
    (
        "硬拉",
        "Deadlift",
        "全身",
        ["臀大肌", "腘绳肌", "竖脊肌"],
        ["背阔肌", "斜方肌"],
        "杠铃",
        "铰链",
    ),
    ("推举", "Overhead Press", "肩", ["三角肌", "肱三头肌"], ["上胸", "核心"], "杠铃", "推"),
    ("引体向上", "Pull-up", "背", ["背阔肌", "肱二头肌"], ["菱形肌", "核心"], "自重", "拉"),
    ("杠铃划船", "Barbell Row", "背", ["背阔肌", "菱形肌"], ["肱二头肌", "竖脊肌"], "杠铃", "拉"),
    ("哑铃弯举", "Dumbbell Curl", "臂", ["肱二头肌"], ["肱肌", "前臂"], "哑铃", "拉"),
    ("三头臂屈伸", "Tricep Dip", "臂", ["肱三头肌"], ["胸大肌", "三角肌前束"], "自重", "推"),
    ("罗马尼亚硬拉", "Romanian Deadlift", "腿", ["腘绳肌", "臀大肌"], ["竖脊肌"], "杠铃", "铰链"),
    ("前蹲", "Front Squat", "腿", ["股四头肌", "核心"], ["臀大肌", "上背"], "杠铃", "蹲"),
    (
        "保加利亚分腿蹲",
        "Bulgarian Split Squat",
        "腿",
        ["股四头肌", "臀大肌"],
        ["腘绳肌", "内收肌"],
        "哑铃",
        "蹲",
    ),
    (
        "哑铃卧推",
        "Dumbbell Bench Press",
        "胸",
        ["胸大肌", "肱三头肌"],
        ["三角肌前束"],
        "哑铃",
        "推",
    ),
    (
        "哑铃肩推",
        "Dumbbell Shoulder Press",
        "肩",
        ["三角肌", "肱三头肌"],
        ["斜方肌", "核心"],
        "哑铃",
        "推",
    ),
    (
        "高拉力下拉",
        "Lat Pulldown",
        "背",
        ["背阔肌", "大圆肌"],
        ["肱二头肌", "菱形肌"],
        "器械",
        "拉",
    ),
    (
        "坐姿划船",
        "Seated Cable Row",
        "背",
        ["背阔肌", "菱形肌"],
        ["肱二头肌", "斜方肌"],
        "器械",
        "拉",
    ),
    ("腿举", "Leg Press", "腿", ["股四头肌", "臀大肌"], ["腘绳肌"], "器械", "蹲"),
    ("腿弯举", "Leg Curl", "腿", ["腘绳肌"], ["腓肠肌"], "器械", "铰链"),
    ("平板支撑", "Plank", "核心", ["腹横肌", "腹直肌"], ["臀大肌", "肩袖"], "自重", "核心"),
    ("卷腹", "Crunch", "核心", ["腹直肌"], ["腹斜肌"], "自重", "核心"),
    ("俄罗斯转体", "Russian Twist", "核心", ["腹斜肌", "腹直肌"], ["髋屈肌"], "自重", "旋转"),
]


def _row(item: tuple[str, str, str, list[str], list[str], str, str]) -> dict[str, object]:
    cn, en, category, primary, secondary, equipment, pattern = item
    return {
        "name_cn": cn,
        "name_en": en,
        "category": category,
        "primary_muscles": primary,
        "secondary_muscles": secondary,
        "equipment": equipment,
        "movement_pattern": pattern,
        "instructions": f"保持躯干稳定，按{pattern}模式完成{cn}，全程控制重量轨迹。下降或还原阶段放慢速度，发力阶段呼气并保持目标肌群紧张。根据动作质量调整负重，不要用惯性完成。",
        "common_mistakes": "常见错误是核心松散、关节轨迹偏移或动作幅度不足。避免追求重量而牺牲控制和稳定性。",
        "difficulty": "intermediate",
    }


def upgrade() -> None:
    op.execute(_TABLES_SQL)
    op.execute(_INDEXES_SQL)
    _ = op.get_bind().execute(_UPSERT_SQL, [_row(exercise) for exercise in _EXERCISES])


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_workout_sets_exercise")
    op.execute("DROP INDEX IF EXISTS idx_workout_exercises_activity")
    op.execute("DROP TABLE IF EXISTS workout_sets")
    op.execute("DROP TABLE IF EXISTS workout_exercises")
    op.execute("DROP TABLE IF EXISTS exercise_library")
