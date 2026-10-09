from contextlib import AbstractAsyncContextManager
from typing import Any, cast

from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row

from infrastructure.auth.settings import settings

_pool: Any = None
_sync_pool: Any = None
ConnectionContext = AbstractAsyncContextManager[AsyncConnection[DictRow]]


def get_pool() -> Any:
    global _pool
    if _pool is None:
        from psycopg_pool import AsyncConnectionPool

        _pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=2,
            max_size=15,
            timeout=10,
            max_lifetime=600,
            kwargs={
                "row_factory": cast(Any, dict_row),
                "prepare_threshold": None,
                "context": None,
            },
            open=False,
        )
    return _pool


def get_sync_pool() -> Any:
    global _sync_pool
    if _sync_pool is None:
        from psycopg_pool import ConnectionPool

        _sync_pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=3,
            timeout=10,
            max_lifetime=600,
            kwargs={
                "prepare_threshold": None,
            },
            open=True,
        )
    return _sync_pool


async def open_pool() -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def close_sync_pool() -> None:
    global _sync_pool
    if _sync_pool is not None:
        _sync_pool.close()
        _sync_pool = None


async def get_conn() -> AsyncConnection[DictRow]:
    pool = get_pool()
    return await pool.getconn()
