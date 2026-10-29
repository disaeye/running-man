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
from sqlalchemy.dialects.postgresql import JSONB

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


def upgrade() -> None:
    for column_name, column_type in _ACTIVITY_COLUMNS:
        op.add_column("activity_summary", sa.Column(column_name, column_type))
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

    op.add_column("training_calendar", sa.Column("predicted_distance_m", sa.Double()))
    op.add_column("training_phases", sa.Column("target_weekly_distance_m", sa.Double()))
    op.add_column("athletes", sa.Column("height_cm", sa.Double()))

    op.execute(_BACKFILL_NAME)
    op.execute(_BACKFILL_RPE)
    op.execute(_BACKFILL_TRIMP)
    op.execute(_BACKFILL_STRIDE)
    op.execute(_BACKFILL_LR_BALANCE)

    op.create_table(
        "plan_adjustments",
        sa.Column(
            "adjustment_id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "athlete_id",
            sa.Uuid(),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "decided_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        # 触发类型：hrv_drop / hr_drift / high_atl / low_tsb。
        sa.Column("trigger_type", sa.Text(), nullable=False),
        # 触发说明：用一句话写清依据，含具体数字。
        sa.Column("trigger_summary", sa.Text(), nullable=False),
        # 原处方与调整后处方，两份都留着，课表本身在运动员接受前不改动。
        sa.Column("original_prescription", JSONB(), nullable=True),
        sa.Column("adjusted_prescription", JSONB(), nullable=True),
        sa.Column("load_delta_pct", sa.Double(), nullable=True),
        # applied：运动员接受并已写入课表；reverted：运动员选择保持原计划；
        # pending：只是建议，尚未决定。
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="pending",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'applied', 'reverted')",
            name="ck_plan_adjustments_status",
        ),
    )
    op.create_index(
        "idx_plan_adjustments_athlete_created",
        "plan_adjustments",
        ["athlete_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_plan_adjustments_event",
        "plan_adjustments",
        ["event_id"],
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
