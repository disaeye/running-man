from time import monotonic
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from infrastructure.auth.models import Athlete
from infrastructure.auth.repo import (
    AthleteRepo,
    LoginAttemptRepo,
    _clear_login_cache_for_ip,
    _login_cache,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    _login_cache.clear()


# ── helpers ──


def _athlete(email: str) -> Athlete:
    return Athlete(
        id=uuid4(),
        email=email,
        password_hash="hash",
        name="Test",
        timezone="UTC",
    )


def _make_cursor(rows: list | None = None) -> AsyncMock:
    mock_cur = AsyncMock()
    rows = rows or []
    mock_cur.fetchone = AsyncMock(return_value=rows[0] if rows else None)
    mock_cur.fetchall = AsyncMock(return_value=rows)
    return mock_cur


def _make_connect(rows: list | None = None) -> AsyncMock:
    mock_cur = _make_cursor(rows)
    # MagicMock so conn.cursor() is a sync call (not a coroutine)
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = AsyncMock()
    mock_conn.cursor.return_value.__aenter__.return_value = mock_cur
    mock_conn.cursor.return_value.__aexit__.return_value = None
    # AsyncMock so async with _connect() as conn: uses class-level __aenter__
    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None
    return mock_cm


def _row(athlete: Athlete) -> dict:
    return {
        "id": athlete.id,
        "email": athlete.email,
        "password_hash": athlete.password_hash,
        "name": athlete.name,
        "timezone": athlete.timezone,
        "failed_count": None,
        "locked_until": None,
    }


# ── Behavior 1: get_by_email_for_login cache HIT skips DB ──


@pytest.mark.no_db
async def test_get_by_email_for_login_cache_hit_skips_db() -> None:
    a = _athlete("c@example.com")
    cursor = _make_cursor([_row(a)])
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = AsyncMock()
    mock_conn.cursor.return_value.__aenter__.return_value = cursor
    mock_conn.cursor.return_value.__aexit__.return_value = None
    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with patch("infrastructure.auth.repo._connect", return_value=mock_cm):
        repo = AthleteRepo()
        r1 = await repo.get_by_email_for_login("c@example.com", "10.0.0.1")
        r2 = await repo.get_by_email_for_login("c@example.com", "10.0.0.1")

    assert r1 == r2 == (a, False, False)
    assert cursor.execute.call_count == 1  # only first call hit the DB


# ── Behavior 2: _clear_login_cache_for_ip removes only matching IP ──


@pytest.mark.no_db
async def test_clear_login_cache_for_ip_removes_target_ip_only() -> None:
    now = monotonic()
    _login_cache[("a", "10.0.0.1")] = (now, None, False, False)
    _login_cache[("b", "10.0.0.1")] = (now, None, False, False)
    _login_cache[("c", "10.0.0.2")] = (now, None, False, False)

    _clear_login_cache_for_ip("10.0.0.1")

    assert ("a", "10.0.0.1") not in _login_cache
    assert ("b", "10.0.0.1") not in _login_cache
    assert ("c", "10.0.0.2") in _login_cache


# ── Behavior 3: LoginAttemptRepo.record_failure clears cache for IP ──


@pytest.mark.no_db
async def test_record_failure_clears_login_cache_for_ip() -> None:
    now = monotonic()
    _login_cache[("a", "10.0.0.1")] = (now, None, False, False)
    _login_cache[("b", "10.0.0.2")] = (now, None, False, False)

    with patch("infrastructure.auth.repo._connect", return_value=_make_connect()):
        repo = LoginAttemptRepo()
        await repo.record_failure("10.0.0.1")

    assert ("a", "10.0.0.1") not in _login_cache
    assert ("b", "10.0.0.2") in _login_cache


# ── Behavior 4: LoginAttemptRepo.clear clears cache for IP ──


@pytest.mark.no_db
async def test_clear_clears_login_cache_for_ip() -> None:
    now = monotonic()
    _login_cache[("a", "10.0.0.1")] = (now, None, False, False)
    _login_cache[("b", "10.0.0.1")] = (now, None, False, False)
    _login_cache[("c", "10.0.0.2")] = (now, None, False, False)

    with patch("infrastructure.auth.repo._connect", return_value=_make_connect()):
        repo = LoginAttemptRepo()
        await repo.clear("10.0.0.1")

    assert ("a", "10.0.0.1") not in _login_cache
    assert ("b", "10.0.0.1") not in _login_cache
    assert ("c", "10.0.0.2") in _login_cache
