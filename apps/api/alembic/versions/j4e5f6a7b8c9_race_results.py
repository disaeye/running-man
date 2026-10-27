import sqlalchemy as sa

from alembic import op

revision = "j4e5f6a7b8c9"
down_revision = "i3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 等级只认真实比赛成绩：训练记录和 PR 外推值都不进这张表，所以它是独立于
    # activity_summary 的录入对象。a1_certified 记的是赛事是否 A1 类认证，评级时
    # 原样带出，不由这张表判断标准是否适用。
    op.create_table(
        "race_results",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "athlete_id",
            sa.Uuid(),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_name", sa.Text(), nullable=False),
        sa.Column("distance_category", sa.Text(), nullable=False),
        sa.Column("time_s", sa.Integer(), nullable=False),
        sa.Column("race_date", sa.Date(), nullable=False),
        sa.Column("a1_certified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("activity_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "distance_category IN ('5k', '10k', 'half', 'marathon')",
            name="ck_race_results_distance_category",
        ),
        sa.CheckConstraint("time_s > 0", name="ck_race_results_time_s"),
    )
    op.create_index(
        "idx_race_results_athlete_race_date",
        "race_results",
        ["athlete_id", sa.text("race_date DESC")],
    )


def downgrade() -> None:
    # 索引随表一起消失，删表就够。
    op.drop_table("race_results")
