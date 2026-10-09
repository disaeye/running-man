"""store the athlete's heart rate zone scheme choice

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-11 18:30:00

Heart rate zones need two independent things: the athlete's thresholds
(``athlete_thresholds``, time-versioned) and the rule that turns those
thresholds into zone edges. The rule was previously hard-coded as a single
percentage table whose reference was never stated, which is how the same "Z4"
ended up meaning two different heart rates in two code paths.

This table records which rule the athlete selected. It is deliberately not
time-versioned: it is a display preference rather than a measurement, so
changing it does not retroactively alter how a past session was executed.
Existing athletes default to the HRmax scheme, which is the only scheme whose
inputs (an age, hence an estimated HRmax) every athlete can supply.
"""

import sqlalchemy as sa

from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_zone_scheme",
        sa.Column("athlete_id", sa.Uuid(), nullable=False),
        sa.Column("hr_scheme", sa.Text(), nullable=False, server_default="hrmax"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["athlete_id"],
            ["athletes.id"],
            name="athlete_zone_scheme_athlete_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("athlete_id"),
    )
    # Mirrors the ZoneScheme keys in domain/insights/zone_schemes.py. ``custom``
    # is deliberately not among them: manual boundaries live in
    # ``zone_overrides`` and overlay a computed scheme rather than replacing it,
    # so offering it as a scheme produced an empty zone table with no reason
    # given. Enforced in the database as well as the repository so an
    # unregistered scheme cannot become a silently-ignored preference.
    op.create_check_constraint(
        "ck_athlete_zone_scheme_hr_scheme",
        "athlete_zone_scheme",
        "hr_scheme IN ('hrmax','lthr','karvonen')",
    )


def downgrade() -> None:
    op.drop_table("athlete_zone_scheme")
