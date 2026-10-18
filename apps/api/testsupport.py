"""Where the DB-backed tests connect, in one place.

`conftest.py` and `scripts/run_gates.py` both need the test DSN, and they used to
carry separate copies of a credential-less default that no environment has. The
suite therefore skipped on every host without someone exporting a DSN by hand.

Resolution order:

1. ``TEST_DATABASE_URL`` when set — always wins, never derived.
2. Otherwise the app's own ``DATABASE_URL`` (from ``apps/api/.env``) with the
   database name replaced by ``wind_runner_test``.

Deriving keeps the credential out of version control while making the suite
runnable by default. The guards below are what make it safe: the target name must
end in ``_test`` and must differ from the source, so a failed substitution cannot
leave the tests pointed at production.
"""

from __future__ import annotations

import os
import re
from urllib.parse import urlsplit

from infrastructure.auth.settings import settings

TEST_DATABASE_NAME = "wind_runner_test"

_DB_NAME = re.compile(r"/(?P<name>[^/?]+)(?P<tail>\?.*)?$")


def test_dsn() -> str:
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    return derive_test_dsn(settings.database_url)


def derive_test_dsn(source: str) -> str:
    match = _DB_NAME.search(source)
    if match is None:
        message = "DATABASE_URL has no database name to replace"
        raise RuntimeError(message)
    current = match.group("name")
    if current == TEST_DATABASE_NAME:
        message = (
            f"DATABASE_URL already names {TEST_DATABASE_NAME}; "
            "set TEST_DATABASE_URL explicitly"
        )
        raise RuntimeError(message)
    derived = f"{source[: match.start()]}/{TEST_DATABASE_NAME}{match.group('tail') or ''}"
    if urlsplit(derived).path.lstrip("/") != TEST_DATABASE_NAME:
        message = "test DSN derivation did not produce the expected database name"
        raise RuntimeError(message)
    return derived
