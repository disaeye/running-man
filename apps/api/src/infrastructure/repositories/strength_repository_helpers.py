from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from infrastructure.db.pool import ConnectionContext, get_pool


def connect() -> ConnectionContext:
    return get_pool().connection()


def row_dict(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))
