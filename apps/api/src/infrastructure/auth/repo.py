from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import LiteralString, Protocol, cast
from uuid import UUID

from domain.auth.constants import LOGIN_LOCK_MINUTES, LOGIN_MAX_ATTEMPTS
from infrastructure.db.pool import ConnectionContext, get_pool

from .models import Athlete

_LOGIN_CACHE_TTL_SECONDS = 30.0
_login_cache: dict[tuple[str, str], tuple[float, Athlete | None, bool, bool]] = {}


class _PoolLike(Protocol):
    def connection(self) -> ConnectionContext: ...


def _connect() -> ConnectionContext:
    pool = cast(_PoolLike, get_pool())
    return pool.connection()


def _to_athlete(row: dict[str, object]) -> Athlete:
    return Athlete(
        id=cast(UUID, row["id"]),
        email=cast(str, row["email"]),
        password_hash=cast(str, row["password_hash"]),
        name=cast(str, row["name"]),
        timezone=cast(str, row["timezone"]),
    )


def _clear_login_cache_for_ip(ip: str) -> None:
    for key in [key for key in _login_cache if key[1] == ip]:
        del _login_cache[key]


class AthleteRepo:
    async def create_athlete(
        self,
        email: str,
        password_hash: str,
        name: str | None = None,
        timezone: str | None = None,
    ) -> Athlete:
        # `COALESCE` rather than building the column list conditionally: the
        # defaults live in the schema, so omitting a value keeps the DB default
        # instead of duplicating it here.
        query = """
        INSERT INTO athletes (email, password_hash, name, timezone)
        VALUES (%s, %s, COALESCE(%s, '跑者'), COALESCE(%s, 'UTC'))
        RETURNING id, email, password_hash, name, timezone
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (email, password_hash, name, timezone))
            row = await cur.fetchone()
        if row is None:
            raise RuntimeError("athlete insert returned no row")
        return _to_athlete(dict(row))

    async def get_by_email(self, email: str) -> Athlete | None:
        return await self._get(
            "SELECT id, email, password_hash, name, timezone FROM athletes WHERE email = %s",
            email,
        )

    async def get_by_email_for_login(
        self,
        email: str,
        ip: str,
    ) -> tuple[Athlete | None, bool, bool]:
        cache_key = (email, ip)
        now = monotonic()
        cached = _login_cache.get(cache_key)
        if cached is not None and now - cached[0] < _LOGIN_CACHE_TTL_SECONDS:
            return cached[1], cached[2], cached[3]
        query = """
        SELECT a.id, a.email, a.password_hash, a.name, a.timezone,
               la.failed_count, la.locked_until
        FROM athletes a
        LEFT JOIN login_attempts la ON la.ip = %s
        WHERE a.email = %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (ip, email))
            row = await cur.fetchone()
        result = _login_result(row)
        _login_cache[cache_key] = (now, result[0], result[1], result[2])
        return result

    async def get_by_id(self, athlete_id: UUID) -> Athlete | None:
        return await self._get(
            "SELECT id, email, password_hash, name, timezone FROM athletes WHERE id = %s",
            athlete_id,
        )

    async def _get(self, query: LiteralString, value: object) -> Athlete | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (value,))
            row = await cur.fetchone()
        return _to_athlete(dict(row)) if row else None


class RevokedTokenRepo:
    async def revoke(self, jti: str) -> None:
        query = "INSERT INTO revoked_tokens (jti) VALUES (%s) ON CONFLICT (jti) DO NOTHING"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (jti,))

    async def is_revoked(self, jti: str) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute("SELECT 1 FROM revoked_tokens WHERE jti = %s", (jti,))
            return await cur.fetchone() is not None


class LoginAttemptRepo:
    async def is_locked(self, ip: str) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute("SELECT locked_until FROM login_attempts WHERE ip = %s", (ip,))
            row = await cur.fetchone()
        return bool(row and row["locked_until"] and row["locked_until"] > datetime.now(UTC))

    async def record_failure(self, ip: str) -> None:
        now = datetime.now(UTC)
        locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
        query = """
        INSERT INTO login_attempts (ip, failed_count, last_attempt, locked_until)
        VALUES (%s, 1, %s, NULL)
        ON CONFLICT (ip) DO UPDATE SET failed_count = login_attempts.failed_count + 1,
        last_attempt = EXCLUDED.last_attempt,
        locked_until = CASE
            WHEN login_attempts.failed_count + 1 >= %s THEN %s
            ELSE NULL
        END
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (ip, now, LOGIN_MAX_ATTEMPTS, locked_until))
        _clear_login_cache_for_ip(ip)

    async def clear(self, ip: str) -> None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute("DELETE FROM login_attempts WHERE ip = %s", (ip,))
        _clear_login_cache_for_ip(ip)


def _login_result(row: object) -> tuple[Athlete | None, bool, bool]:
    if not row:
        return None, False, False
    row_dict = dict(cast(dict[str, object], row))
    locked_until = cast(datetime | None, row_dict.get("locked_until"))
    is_locked = bool(locked_until and locked_until > datetime.now(UTC))
    failed_count = cast(int | None, row_dict.get("failed_count"))
    return _to_athlete(row_dict), is_locked, bool(failed_count)
