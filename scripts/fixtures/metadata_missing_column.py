from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import MetaData, Table

REPO_ROOT = Path(__file__).resolve().parents[2]
API_SRC = REPO_ROOT / "apps" / "api" / "src"
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))

from infrastructure.db import Base  # noqa: E402
from infrastructure.db import models as _models  # noqa: E402,F401
from infrastructure.db.models import sharing as _sharing  # noqa: E402,F401
from infrastructure.db.models import strength as _strength  # noqa: E402,F401
from infrastructure.db.models import sync as _sync  # noqa: E402,F401

OMITTED_TABLE = "activity_summary"
OMITTED_COLUMN = "has_gps"

metadata = MetaData()

for source_table in Base.metadata.sorted_tables:
    if source_table.name != OMITTED_TABLE:
        source_table.to_metadata(metadata)
        continue
    columns = [column.copy() for column in source_table.columns if column.name != OMITTED_COLUMN]
    Table(source_table.name, metadata, *columns, schema=source_table.schema)
