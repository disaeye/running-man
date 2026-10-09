"""remove the retired strava source definition

Strava support was removed from the product: the adapter, the sync path and the
`strava` entry in the source contract are all gone, so `SOURCE_DEFINITIONS` no
longer lists it.

The seed migration upserts rather than replaces, which is the right call for
adding rows but leaves a retired key in place forever. The result was that two
databases disagreed: a fresh one built by `alembic upgrade head` had five
sources, while any database carried over from before the removal kept six. The
stale row is invisible in the app (no adapter ever emits it) but it is a real
foreign key target, so anything still referencing it would keep working by
accident and then break on a rebuild.

Deleting is safe: this migration refuses to run rather than orphan data.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-09-14

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

_RETIRED_SOURCE = "strava"


def upgrade() -> None:
    connection = op.get_bind()

    # A row still in use means the removal was incomplete somewhere else; fail
    # loudly instead of deleting the definition out from under it.
    in_use = connection.execute(
        sa.text(
            "SELECT count(*) FROM activity_summary WHERE source = :source"
        ),
        {"source": _RETIRED_SOURCE},
    ).scalar_one()
    if in_use:
        raise RuntimeError(
            f"{in_use} activity row(s) still reference source '{_RETIRED_SOURCE}'; "
            "reassign or delete them before removing the definition"
        )

    _ = connection.execute(
        sa.text("DELETE FROM source_definitions WHERE source_key = :source"),
        {"source": _RETIRED_SOURCE},
    )


def downgrade() -> None:
    connection = op.get_bind()
    _ = connection.execute(
        sa.text(
            """
            INSERT INTO source_definitions (
                source_key, display_name, aliases, adapter_only_aliases, input_metrics
            ) VALUES (
                :source, 'Strava', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
            )
            ON CONFLICT (source_key) DO NOTHING
            """
        ),
        {"source": _RETIRED_SOURCE},
    )
