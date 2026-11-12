"""extend activity, calendar and athlete columns for the demo-shaped pages

Revision ID: k5a6b7c8d9e0
Revises: j4e5f6a7b8c9
Create Date: 2026-10-27 00:00:00

The demo pages need fields the current schema does not carry:

1. ``activity_summary`` gains the per-activity fields the redesigned pages
   show: the activity name, the source RPE and TRIMP, the running-dynamics
   averages derived from the FIT stream (stride length, vertical oscillation,
   ground contact time, left/right balance), the device training-effect pair
   when the FIT session frame carries it, the bookmark flag, and the weather
   provenance columns.
2. ``training_calendar`` gains ``predicted_distance_m`` so a planned session
   can state a distance target, and ``training_phases`` gains
   ``target_weekly_distance_m`` for the same reason at week granularity.
3. ``athletes`` gains ``height_cm``; body-mass index cannot be computed
   without it, and the Intervals.icu athlete record already carries it.
4. ``plan_adjustments`` is a new table recording a suggested change to a
   planned session: what triggered it, the original prescription, the adjusted
   prescription, and whether the athlete accepted or kept the original.

The four biomechanics columns are filled from the stored FIT stream, not from
a device summary field, so the values can be recomputed whenever the stream
changes. Everything else is copied from the source payload.
"""

from typing import Any

import sqlalchemy as sa

from alembic import op

revision = "k5a6b7c8d9e0"
down_revision = "j4e5f6a7b8c9"
branch_labels = None
depends_on = None

_ACTIVITY_COLUMNS: list[tuple[str, sa.types.TypeEngine[Any]]] = [
    # 活动名称：Intervals.icu 活动 JSON 的 name 字段。
    ("name", sa.Text()),
    # 自感用力度：Intervals.icu 的 icu_rpe / perceived_exertion。
    ("rpe", sa.SmallInteger()),
    # 训练冲量：Intervals.icu 的 trimp，单位与 TSS 同量级但算法不同。
    ("trimp", sa.Double()),
    # 跑步动力学：步长与左右平衡是 Intervals.icu 活动 JSON 的源字段，直接存入。
    # 垂直振幅与触地时间不在这里：它们只能从 FIT 流计算，属于派生值，
    # 按项目约定由 derived_metric_facts 或读取时聚合承担。
    ("avg_stride_length_m", sa.Double()),
    ("avg_lr_balance_pct", sa.Double()),
    # 设备训练效益：只有 FIT session 帧写入这两个字段时才有值。
    ("aerobic_te", sa.Double()),
    ("anaerobic_te", sa.Double()),
    # 收藏标记。
    ("is_bookmarked", sa.Boolean()),
    # 天气来源与获取时间：intervals_icu 来自活动 JSON，open_meteo 来自按坐标
    # 的历史天气回补，两者都要能追溯。
    ("weather_source", sa.Text()),
    ("weather_fetched_at", sa.DateTime(timezone=True)),
]

_BACKFILL_NAME = """
UPDATE activity_summary
SET name = raw_data->>'name'
WHERE raw_data IS NOT NULL AND name IS NULL AND raw_data ? 'name'
"""

_BACKFILL_RPE = """
UPDATE activity_summary
SET rpe = COALESCE(
        NULLIF(raw_data->>'icu_rpe', '')::smallint,
        NULLIF(raw_data->>'perceived_exertion', '')::smallint,
        NULLIF(raw_data->>'feel', '')::smallint
    )
WHERE raw_data IS NOT NULL AND rpe IS NULL
  AND (raw_data ? 'icu_rpe' OR raw_data ? 'perceived_exertion' OR raw_data ? 'feel')
"""

_BACKFILL_TRIMP = """
UPDATE activity_summary
SET trimp = NULLIF(raw_data->>'trimp', '')::double precision
WHERE raw_data IS NOT NULL AND trimp IS NULL AND raw_data ? 'trimp'
"""

_BACKFILL_STRIDE = """
UPDATE activity_summary
SET avg_stride_length_m = NULLIF(raw_data->>'average_stride', '')::double precision
WHERE raw_data IS NOT NULL AND avg_stride_length_m IS NULL AND raw_data ? 'average_stride'
"""

_BACKFILL_LR_BALANCE = """
UPDATE activity_summary
SET avg_lr_balance_pct = NULLIF(raw_data->>'avg_lr_balance', '')::double precision
WHERE raw_data IS NOT NULL AND avg_lr_balance_pct IS NULL AND raw_data ? 'avg_lr_balance'
"""


_ACTIVITY_COLUMN_SQL: dict[str, str] = {
    "name": "TEXT",
    "rpe": "SMALLINT",
    "trimp": "DOUBLE PRECISION",
    "avg_stride_length_m": "DOUBLE PRECISION",
    "avg_lr_balance_pct": "DOUBLE PRECISION",
    "aerobic_te": "DOUBLE PRECISION",
    "anaerobic_te": "DOUBLE PRECISION",
    "is_bookmarked": "BOOLEAN",
    "weather_source": "TEXT",
    "weather_fetched_at": "TIMESTAMPTZ",
}


def upgrade() -> None:
    for column_name, column_sql in _ACTIVITY_COLUMN_SQL.items():
        op.execute(
            f"ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS {column_name} {column_sql}"
        )
    op.execute("UPDATE activity_summary SET is_bookmarked = false WHERE is_bookmarked IS NULL")
    op.execute("ALTER TABLE activity_summary ALTER COLUMN is_bookmarked SET NOT NULL")
    op.execute("ALTER TABLE activity_summary ALTER COLUMN is_bookmarked SET DEFAULT false")

    # 天气来源：已带天气的活动标为 intervals_icu，天气列全空的保持 NULL，
    # 由回补模块按坐标取数后写入。
    op.execute(
        """
        UPDATE activity_summary
        SET weather_source = 'intervals_icu'
        WHERE weather_source IS NULL
          AND (weather_avg_temp IS NOT NULL
               OR weather_min_temp IS NOT NULL
               OR weather_max_temp IS NOT NULL
               OR weather_wind_speed IS NOT NULL)
        """
    )

    op.execute(
        "ALTER TABLE training_calendar "
        "ADD COLUMN IF NOT EXISTS predicted_distance_m DOUBLE PRECISION"
    )
    op.execute(
        "ALTER TABLE training_phases "
        "ADD COLUMN IF NOT EXISTS target_weekly_distance_m DOUBLE PRECISION"
    )
    op.execute("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS height_cm DOUBLE PRECISION")

    op.execute(_BACKFILL_NAME)
    op.execute(_BACKFILL_RPE)
    op.execute(_BACKFILL_TRIMP)
    op.execute(_BACKFILL_STRIDE)
    op.execute(_BACKFILL_LR_BALANCE)

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS plan_adjustments (
            adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            decided_at TIMESTAMPTZ,
            trigger_type TEXT NOT NULL,
            trigger_summary TEXT NOT NULL,
            original_prescription JSONB,
            adjusted_prescription JSONB,
            load_delta_pct DOUBLE PRECISION,
            status TEXT NOT NULL DEFAULT 'pending',
            CONSTRAINT ck_plan_adjustments_status
                CHECK (status IN ('pending', 'applied', 'reverted'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_plan_adjustments_athlete_created "
        "ON plan_adjustments (athlete_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_plan_adjustments_event ON plan_adjustments (event_id)"
    )


def downgrade() -> None:
    op.drop_index("idx_plan_adjustments_event", table_name="plan_adjustments")
    op.drop_index("idx_plan_adjustments_athlete_created", table_name="plan_adjustments")
    op.drop_table("plan_adjustments")
    op.drop_column("athletes", "height_cm")
    op.drop_column("training_phases", "target_weekly_distance_m")
    op.drop_column("training_calendar", "predicted_distance_m")
    for column_name, _column_type in reversed(_ACTIVITY_COLUMNS):
        op.drop_column("activity_summary", column_name)
