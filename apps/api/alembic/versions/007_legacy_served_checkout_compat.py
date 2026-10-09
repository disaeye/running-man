"""recognize legacy served-checkout revision 007

Revision ID: 007
Revises: e2f3a4b5c6d7
Create Date: 2026-07-16 00:00:00

The production database was previously advanced by a short-lived local
served-checkout migration chain whose terminal revision was ``007``. The
canonical migration chain supersedes those files, but Alembic still needs to
recognize the recorded revision before it can apply the canonical heads.
"""

revision = "007"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
