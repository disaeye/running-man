from unittest.mock import patch

from infrastructure.db import pool


def test_get_pool_uses_configured_limits() -> None:
    pool._pool = None

    try:
        with patch("psycopg_pool.AsyncConnectionPool") as pool_class:
            _ = pool.get_pool()

        pool_class.assert_called_once()
        call_kwargs = pool_class.call_args.kwargs
        connection_kwargs = call_kwargs["kwargs"]

        assert call_kwargs["min_size"] == 2
        assert call_kwargs["max_size"] == 15
        assert call_kwargs["timeout"] == 10
        assert call_kwargs["max_lifetime"] == 600
        assert "check" not in call_kwargs
        assert connection_kwargs["prepare_threshold"] is None
    finally:
        pool._pool = None


def test_get_sync_pool_uses_configured_limits() -> None:
    pool._sync_pool = None

    try:
        with patch("psycopg_pool.ConnectionPool") as pool_class:
            _ = pool.get_sync_pool()

        pool_class.assert_called_once()
        call_kwargs = pool_class.call_args.kwargs
        connection_kwargs = call_kwargs["kwargs"]

        assert call_kwargs["min_size"] == 1
        assert call_kwargs["max_size"] == 3
        assert call_kwargs["timeout"] == 10
        assert call_kwargs["max_lifetime"] == 600
        assert call_kwargs["open"] is True
        assert "check" not in call_kwargs
        assert "row_factory" not in connection_kwargs
        assert connection_kwargs["prepare_threshold"] is None
    finally:
        pool._sync_pool = None


def test_close_sync_pool_closes_and_clears_pool() -> None:
    class _SyncPool:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    sync_pool = _SyncPool()
    pool._sync_pool = sync_pool

    pool.close_sync_pool()

    assert sync_pool.closed is True
    assert pool._sync_pool is None
