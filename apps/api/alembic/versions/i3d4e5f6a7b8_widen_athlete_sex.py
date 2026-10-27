"""Widen ``athletes.sex`` so it can hold the vocabulary the API and UI use.

The column was created as ``VARCHAR(1)`` in ``2f3a4b5c6d7e``, but every layer
that touches it speaks ``male`` / ``female``: the settings form's select sends
those two words, the API schema documents ``str``, and the readers that classify
VO2max already accept both spellings. Saving the profile therefore hit
``value too long for type character varying(1)`` and answered 500 — the whole
form, thresholds included, could not be saved once a sex was chosen.

Six characters hold ``female``. Existing single-letter rows are rewritten to the
same words so one value does not mean two things after this migration.
"""

from alembic import op

revision = "i3d4e5f6a7b8"
down_revision = "h2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE athletes ALTER COLUMN sex TYPE VARCHAR(6)")
    op.execute("UPDATE athletes SET sex = 'male' WHERE lower(sex) = 'm'")
    op.execute("UPDATE athletes SET sex = 'female' WHERE lower(sex) = 'f'")


def downgrade() -> None:
    op.execute("UPDATE athletes SET sex = 'M' WHERE sex = 'male'")
    op.execute("UPDATE athletes SET sex = 'F' WHERE sex = 'female'")
    op.execute("ALTER TABLE athletes ALTER COLUMN sex TYPE VARCHAR(1)")
