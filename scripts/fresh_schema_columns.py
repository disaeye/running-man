from __future__ import annotations

from typing import Any


def table_columns(connection: Any) -> dict[str, set[str]]:
    partitions = partition_names(connection)
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, column_name
            """
        )
        result: dict[str, set[str]] = {}
        for row in cur.fetchall():
            table_name = text_value(row["table_name"])
            if table_name == "alembic_version" or table_name in partitions:
                continue
            result.setdefault(table_name, set()).add(text_value(row["column_name"]))
        return result


def partition_names(connection: Any) -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT child.relname
            FROM pg_inherits
            JOIN pg_class child ON child.oid = pg_inherits.inhrelid
            JOIN pg_namespace n ON n.oid = child.relnamespace
            WHERE n.nspname = 'public'
            """
        )
        return {text_value(row["relname"]) for row in cur.fetchall()}


def text_value(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)
