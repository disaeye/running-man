"""reseed builtin templates with corrected non-work domains and pace anchors

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-11-10
"""

from collections.abc import Sequence
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "p2q3r4s5t6u7"
down_revision: str | Sequence[str] | None = "o1p2q3r4s5t6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TEMPLATE_TABLE = sa.table(
    "workout_templates",
    sa.column("athlete_id", sa.Uuid()),
    sa.column("name", sa.Text()),
    sa.column("sport", sa.String()),
    sa.column("goal_type", sa.String()),
    sa.column("segments", JSONB()),
    sa.column("source", sa.String()),
)


def _seed_module() -> ModuleType:
    path = Path(__file__).with_name("o1p2q3r4s5t6_reseed_builtin_templates.py")
    spec = spec_from_file_location("_reseed_source_o1p2q3r4s5t6", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load the builtin template source migration")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _rows() -> list[dict[str, object]]:
    source = _seed_module()
    return [
        {
            "athlete_id": None,
            "name": source.NAMES[goal_type],
            "sport": "Run",
            "goal_type": goal_type,
            "segments": source._segments(goal_type),
            "source": "builtin",
        }
        for goal_type in source.SPEC
    ]


def upgrade() -> None:
    op.execute("DELETE FROM workout_templates WHERE source = 'builtin' AND athlete_id IS NULL")
    op.bulk_insert(_TEMPLATE_TABLE, cast(list[dict[str, Any]], _rows()))


def downgrade() -> None:
    op.execute("DELETE FROM workout_templates WHERE source = 'builtin' AND athlete_id IS NULL")
