from __future__ import annotations

import re
from typing import Any, Final

from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.schema import Column, DefaultClause

CAST_RE: Final = re.compile(r"::[a-zA-Z_ ]+(?:\[\])?")
SPACE_RE: Final = re.compile(r"\s+")
QUOTE_WRAPPER_LENGTH: Final = 2


def compile_type(value: Any, dialect: Dialect) -> str:
    return str(value.compile(dialect=dialect))


def metadata_default(column: Column[Any], dialect: Dialect) -> str | None:
    if not isinstance(column.server_default, DefaultClause):
        return None
    arg = column.server_default.arg
    if isinstance(arg, str):
        return normalize_default(arg)
    return normalize_default(str(arg.compile(dialect=dialect)))


def defaults_match(
    column: Column[Any], metadata_default: str | None, reflected_default: str | None
) -> bool:
    if metadata_default == reflected_default:
        return True
    return (
        reflected_default is not None
        and reflected_default.startswith("nextval(")
        and column.primary_key
    )


def normalize_type(value: str) -> str:
    normalized = SPACE_RE.sub(" ", value.lower().strip())
    match normalized:
        case "double precision" | "float" | "float(53)":
            return "double precision"
        case "character varying":
            return "varchar"
        case other:
            return other


def normalize_default(value: Any) -> str | None:
    if value is None:
        return None
    normalized = SPACE_RE.sub("", str(value).strip().lower())
    normalized = CAST_RE.sub("", normalized)
    while normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1]
    if (
        len(normalized) >= QUOTE_WRAPPER_LENGTH
        and normalized[0] == "'"
        and normalized[-1] == "'"
    ):
        normalized = normalized[1:-1]
    match normalized:
        case "false" | "'false'":
            return "false"
        case "true" | "'true'":
            return "true"
        case "now()" | "current_timestamp":
            return "now()"
        case other:
            return other
