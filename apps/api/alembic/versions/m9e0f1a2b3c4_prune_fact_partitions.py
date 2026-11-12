"""prune activity_summary partitions in the daily facts function

Revision ID: m9e0f1a2b3c4
Revises: l8d9e0f1a2b3
Create Date: 2026-11-05 00:01:00

``get_athlete_daily_facts`` filters ``activity_compute`` by the athlete's local
calendar day. That is an expression on the partition key ``start_time``, so
PostgreSQL keeps every monthly partition of ``activity_summary`` in the plan.
Adding a wider UTC bound on the key itself lets the planner keep only the
partitions that can contain a matching row; the local-day filter is untouched,
so the result set is identical.

The weekly function aggregates the daily function and needs no change.
"""

from alembic import op
from infrastructure.db.migration_sql.fact_partition_bounds_sql import (
    DAILY_FACTS_WITH_BOUNDS,
    DAILY_FACTS_WITHOUT_BOUNDS,
)

revision = "m9e0f1a2b3c4"
down_revision = "l8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(DAILY_FACTS_WITH_BOUNDS)


def downgrade() -> None:
    op.execute(DAILY_FACTS_WITHOUT_BOUNDS)
