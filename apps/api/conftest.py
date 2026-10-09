"""pytest configuration: PostgreSQL fixture + VCR.py setup."""

import asyncio
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import cast

import psycopg
import pytest
from _pytest.fixtures import SubRequest

from infrastructure.auth.settings import settings as app_settings
from infrastructure.db.pool import close_pool, open_pool

TEST_DSN = "postgresql://postgres@/test_running_man?host=/var/run/postgresql&port=15434"


@pytest.fixture(scope="session")
def db_conn() -> Generator[psycopg.Connection, None, None]:
    """Session-scoped connection to test DB.

    Each test runs inside a savepoint that is rolled back automatically
    (force_rollback=True), so no data leaks between tests.
    """
    conn = psycopg.connect(TEST_DSN)
    yield conn
    conn.close()


@pytest.fixture(scope="session", autouse=True)
async def app_pool_on_test_database() -> AsyncGenerator[None, None]:
    """Point the app's global connection pool at the test database, for good.

    `settings.database_url` is read from `apps/api/.env` and names *production*.
    Any test that exercises the app through `ASGITransport` therefore reaches for
    a connection to the real database unless something redirects it, and one
    test did that by hand — `_use_test_pool` in `test_coach_context.py` closed
    the global pool and reopened it against `TEST_DSN` mid-session.

    That worked for the test that called it and broke whichever test ran next:
    the pool it left behind was closed, so the following request failed with
    `PoolClosed: the pool 'pool-1' is not open yet`. It only showed up when
    `test_coach_context.py` was collected first, which is why the file passed on
    its own and the suite failed.

    Doing it once here removes the need for any test to mutate it. Teardown is
    best-effort because the tests it served use function-scoped event loops
    while this fixture is session-scoped: by the time the session ends the loop
    the pool was opened on is gone, and awaiting a close on it raises
    ``CancelledError``.
    """
    previous_url = app_settings.database_url
    await close_pool()
    app_settings.database_url = TEST_DSN
    await open_pool()
    try:
        yield
    finally:
        app_settings.database_url = previous_url
        try:
            await close_pool()
        except (RuntimeError, asyncio.CancelledError):
            # The event loop the pool was opened on has already shut down. The
            # process is exiting, so the connections go with it.
            pass


@pytest.fixture(autouse=True)
def pg_transaction_rollback(
    request: SubRequest,
) -> Generator[None, None, None]:
    """Wrap each test in a savepoint; rolled back after the test finishes."""
    if "tests/domain" in request.node.path.as_posix():
        # Domain tests are pure — no DB needed.
        yield
        return

    db_conn = cast(psycopg.Connection, request.getfixturevalue("db_conn"))

    if request.node.get_closest_marker("no_db"):
        # No savepoint here — but the test may have left an implicit open
        # transaction (or an aborted one) on the session connection, which
        # would block or poison later tests (e.g. the TRUNCATE in
        # ensure_activity_fact_schema). Clear it.
        yield
        db_conn.rollback()
        return

    with db_conn.transaction(force_rollback=True):
        yield


# ---------------------------------------------------------------------------
# VCR.py — record_mode="none" (playback-only) by default
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def vcr_config() -> dict[str, object]:
    return {
        "cassette_library_dir": str(Path(__file__).parent / "tests" / "cassettes"),
        "record_mode": "none",
        "filter_headers": [
            ("authorization", "***FILTERED***"),
            ("x-api-key", "***FILTERED***"),
        ],
        "filter_query_parameters": ["api_key", "secret"],
    }
