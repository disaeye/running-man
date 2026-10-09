from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None

CHECKS = (
    (
        "ck_training_calendar_plan_source",
        "plan_source IS NULL OR plan_source IN ('generator', 'intervals_icu', 'manual')",
    ),
    (
        "ck_training_calendar_training_type",
        "training_type IS NULL OR training_type IN ('easy', 'recovery', 'long', 'tempo', 'intervals', 'race')",
    ),
    (
        "ck_training_calendar_completed_distance",
        "completed_distance_m IS NULL OR completed_distance_m BETWEEN 0 AND 1000000",
    ),
    (
        "ck_training_calendar_completed_duration",
        "completed_duration_s IS NULL OR completed_duration_s BETWEEN 1 AND 172800",
    ),
    (
        "ck_training_calendar_completed_avg_hr",
        "completed_avg_hr IS NULL OR completed_avg_hr BETWEEN 25 AND 260",
    ),
    (
        "ck_training_calendar_completed_rpe",
        "completed_rpe IS NULL OR completed_rpe BETWEEN 1 AND 10",
    ),
)


def upgrade() -> None:
    for constraint, expression in CHECKS:
        op.create_check_constraint(constraint, "training_calendar", expression)


def downgrade() -> None:
    for constraint, _expression in reversed(CHECKS):
        op.drop_constraint(constraint, "training_calendar", type_="check")
