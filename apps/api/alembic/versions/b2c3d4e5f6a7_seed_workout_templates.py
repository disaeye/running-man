"""seed workout templates

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-19 00:00:00.000000
"""

import json
from collections.abc import Sequence
from importlib import import_module

import sqlalchemy as sa

op = import_module("alembic.op")

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS workout_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NULL REFERENCES athletes(id),
    name TEXT NOT NULL,
    sport VARCHAR(50) NOT NULL DEFAULT 'Run',
    goal_type VARCHAR(50),
    segments JSONB,
    predicted_tss DOUBLE PRECISION,
    source VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_templates_athlete ON workout_templates(athlete_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_goal
    ON workout_templates(goal_type) WHERE goal_type IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_builtin_workout_templates_goal
    ON workout_templates(goal_type) WHERE source = 'builtin' AND athlete_id IS NULL;
"""

_UPSERT_SQL = sa.text("""
INSERT INTO workout_templates (athlete_id, name, sport, goal_type, segments, source)
VALUES (NULL, :name, 'Run', :goal_type, CAST(:segments AS jsonb), 'builtin')
ON CONFLICT (goal_type) WHERE source = 'builtin' AND athlete_id IS NULL DO UPDATE SET
name = EXCLUDED.name, sport = EXCLUDED.sport, segments = EXCLUDED.segments
""")

_TEMPLATES = [
    ("恢复跑", "recovery", [("SteadyState", 1800, 0.55, 0.65)]),
    ("有氧基础", "aerobic-base", [("SteadyState", 3600, 0.65, 0.78)]),
    (
        "节奏跑",
        "tempo",
        [
            ("Warmup", 900, 0.6, 0.7),
            ("SteadyState", 1800, 0.82, 0.88),
            ("Cooldown", 600, 0.55, 0.65),
        ],
    ),
    (
        "阈值间歇",
        "threshold",
        [
            ("Warmup", 900, 0.6, 0.75),
            *(("IntervalsT", 300, 0.97, 1.05),) * 4,
            ("Cooldown", 600, 0.55, 0.65),
        ],
    ),
    (
        "VO₂max 间歇",
        "vo2max",
        [
            ("Warmup", 900, 0.6, 0.75),
            *(("IntervalsT", 180, 1.05, 1.15),) * 5,
            ("Cooldown", 600, 0.55, 0.65),
        ],
    ),
    ("长距离", "long-run", [("SteadyState", 5400, 0.68, 0.78)]),
]


def _segments(items: list[tuple[str, int, float, float]]) -> str:
    return json.dumps(
        [
            {"segment_type": kind, "duration_s": seconds, "power_low": low, "power_high": high}
            for kind, seconds, low, high in items
        ]
    )


def upgrade() -> None:
    op.execute(_CREATE_SQL)
    rows = [
        {"name": name, "goal_type": goal_type, "segments": _segments(segments)}
        for name, goal_type, segments in _TEMPLATES
    ]
    op.get_bind().execute(_UPSERT_SQL, rows)


def downgrade() -> None:
    op.execute("DELETE FROM workout_templates WHERE source = 'builtin' AND athlete_id IS NULL")
    op.execute("DROP INDEX IF EXISTS uniq_builtin_workout_templates_goal")
