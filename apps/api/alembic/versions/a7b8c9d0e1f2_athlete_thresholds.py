"""replace ftp_history with a time-versioned athlete_thresholds table

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-11 18:00:00

Thresholds used to live in two incompatible places:

* ``ftp_history`` — a time-versioned table keyed by ``(athlete_id,
  effective_from)`` holding ``ftp`` and ``lthr``. The load recompute path
  resolved ``ftp``/``lthr`` from it per activity date. It also carried three
  ``detected_ftp*`` columns that no reader ever consumed.
* ``athletes.hr_max`` / ``lthr`` / ``resting_hr`` / ``threshold_pace`` —
  single-valued columns, so the compute path read "today's" value when
  recomputing any historical activity. Changing a threshold rewrote history.

For a running-first product that is the wrong split: ``threshold_pace`` (the
primary running threshold) had no history at all, while ``ftp`` (a cycling
metric with no data in this deployment) did. This migration unifies all
athlete thresholds into one time-versioned table:

* ``athlete_thresholds (athlete_id, effective_from)`` holds ``hr_max``,
  ``resting_hr``, ``lthr``, ``threshold_pace``. Every compute path resolves
  the value in force on the activity's date, so historical load never drifts
  when a threshold is updated.
* Power/FTP is dropped entirely — this product targets running. ``ftp_history``
  is removed along with its ``detected_ftp`` columns and every FTP endpoint.

Migration order matters: the new table is created and populated from *both*
legacy sources before either is dropped, so no threshold value is lost. When
both sources disagree (``ftp_history.lthr`` vs ``athletes.lthr``), the row for
the activity history wins for past dates and the ``athletes`` value is written
as today's row, preserving both observations instead of silently picking one.
"""

import sqlalchemy as sa

from alembic import op

revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None

# Thresholds that move out of ``athletes`` into the time-versioned table.
_ATHLETE_THRESHOLD_COLUMNS = ("hr_max", "resting_hr", "lthr", "threshold_pace")


def upgrade() -> None:
    op.create_table(
        "athlete_thresholds",
        sa.Column("athlete_id", sa.Uuid(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("hr_max", sa.Integer(), nullable=True),
        sa.Column("resting_hr", sa.Integer(), nullable=True),
        sa.Column("lthr", sa.Integer(), nullable=True),
        sa.Column("threshold_pace", sa.Double(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default="manual"),
        sa.Column("algorithm_version", sa.Text(), nullable=True),
        sa.Column("computation_run_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["athlete_id"],
            ["athletes.id"],
            name="athlete_thresholds_athlete_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["computation_run_id"],
            ["computation_runs.id"],
            name="athlete_thresholds_computation_run_id_fkey",
        ),
        sa.PrimaryKeyConstraint("athlete_id", "effective_from"),
    )
    op.create_check_constraint(
        "ck_athlete_thresholds_source",
        "athlete_thresholds",
        "source IN ('manual','estimated')",
    )
    # Physiological plausibility. Bounds mirror ``legal_min``/``legal_max`` in
    # contracts/v1/metrics.yaml for the same quantities; ``threshold_pace`` is
    # s/km, so 120 s/km (2:00/km) .. 900 s/km (15:00/km) covers sprint through
    # walk-run pace without admitting unit mistakes (e.g. seconds-per-mile or
    # min/km stored as a plain number).
    op.create_check_constraint(
        "ck_athlete_thresholds_hr_max",
        "athlete_thresholds",
        "hr_max IS NULL OR (hr_max >= 100 AND hr_max <= 260)",
    )
    op.create_check_constraint(
        "ck_athlete_thresholds_resting_hr",
        "athlete_thresholds",
        "resting_hr IS NULL OR (resting_hr >= 25 AND resting_hr <= 120)",
    )
    op.create_check_constraint(
        "ck_athlete_thresholds_lthr",
        "athlete_thresholds",
        "lthr IS NULL OR (lthr >= 80 AND lthr <= 240)",
    )
    op.create_check_constraint(
        "ck_athlete_thresholds_threshold_pace",
        "athlete_thresholds",
        "threshold_pace IS NULL OR (threshold_pace >= 120 AND threshold_pace <= 900)",
    )
    # A row with no threshold at all carries no information and would shadow
    # real history during ``resolve`` (most recent row wins).
    op.create_check_constraint(
        "ck_athlete_thresholds_not_empty",
        "athlete_thresholds",
        "hr_max IS NOT NULL OR resting_hr IS NOT NULL"
        " OR lthr IS NOT NULL OR threshold_pace IS NOT NULL",
    )

    bind = op.get_bind()

    # 1. FTP-step history first: it is the only source with real dates for
    #    past activities, so it must exist before today's row is added.
    bind.execute(
        sa.text(
            """
            INSERT INTO athlete_thresholds (
                athlete_id, effective_from, lthr, source
            )
            SELECT athlete_id, effective_from, lthr, 'manual'
            FROM ftp_history
            WHERE lthr IS NOT NULL
            ON CONFLICT (athlete_id, effective_from) DO UPDATE
            SET lthr = EXCLUDED.lthr
            """
        )
    )

    # 2. Then the current athlete-level values, stamped today. Existing rows
    #    for (athlete_id, today) are merged column-wise so a same-day conflict
    #    keeps both the historical lthr and the other thresholds.
    for column in _ATHLETE_THRESHOLD_COLUMNS:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO athlete_thresholds (
                    athlete_id, effective_from, {column}, source
                )
                SELECT id, CURRENT_DATE, {column}, 'manual'
                FROM athletes
                WHERE {column} IS NOT NULL
                ON CONFLICT (athlete_id, effective_from) DO UPDATE
                SET {column} = EXCLUDED.{column}
                """
            )
        )

    # 3. Retire the legacy storage. Dropping the columns is deliberate: leaving
    #    them would re-create the two-sources-of-truth problem this migration
    #    exists to remove.
    op.drop_table("ftp_history")
    for column in _ATHLETE_THRESHOLD_COLUMNS:
        op.drop_column("athletes", column)


def downgrade() -> None:
    op.add_column("athletes", sa.Column("hr_max", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("resting_hr", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("lthr", sa.Integer(), nullable=True))
    op.add_column("athletes", sa.Column("threshold_pace", sa.Double(), nullable=True))

    op.create_table(
        "ftp_history",
        sa.Column("athlete_id", sa.Uuid(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("ftp", sa.Integer(), nullable=False),
        sa.Column("lthr", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("athlete_id", "effective_from"),
    )

    bind = op.get_bind()
    # Latest known value per athlete goes back to the single-valued columns.
    bind.execute(
        sa.text(
            """
            UPDATE athletes a SET
                hr_max = t.hr_max,
                resting_hr = t.resting_hr,
                lthr = t.lthr,
                threshold_pace = t.threshold_pace
            FROM (
                SELECT DISTINCT ON (athlete_id)
                    athlete_id, hr_max, resting_hr, lthr, threshold_pace
                FROM athlete_thresholds
                ORDER BY athlete_id, effective_from DESC
            ) t
            WHERE a.id = t.athlete_id
            """
        )
    )
    op.drop_table("athlete_thresholds")
