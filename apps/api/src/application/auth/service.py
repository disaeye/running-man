from typing import Protocol
from uuid import UUID

from domain.auth.passwords import hash_password, verify_password
from domain.auth.tokens import JWTError, create_access_token, create_refresh_token, decode_token
from infrastructure.auth.models import Athlete, TokenPair


class DuplicateEmailError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class RateLimitError(Exception):
    pass


class AthleteStore(Protocol):
    async def create_athlete(
        self,
        email: str,
        password_hash: str,
        name: str | None = None,
        timezone: str | None = None,
    ) -> Athlete: ...
    async def get_by_email(self, email: str) -> Athlete | None: ...
    async def get_by_id(self, athlete_id: UUID) -> Athlete | None: ...


class RevokedStore(Protocol):
    async def revoke(self, jti: str) -> None: ...
    async def is_revoked(self, jti: str) -> bool: ...


class AttemptStore(Protocol):
    async def is_locked(self, ip: str) -> bool: ...
    async def record_failure(self, ip: str) -> None: ...
    async def clear(self, ip: str) -> None: ...


class AuthService:
    def __init__(
        self,
        athletes: AthleteStore,
        revoked_tokens: RevokedStore,
        login_attempts: AttemptStore,
        jwt_secret: str,
    ) -> None:
        self.athletes: AthleteStore = athletes
        self.revoked_tokens: RevokedStore = revoked_tokens
        self.login_attempts: AttemptStore = login_attempts
        self.jwt_secret: str = jwt_secret

    async def register(
        self,
        email: str,
        password: str,
        name: str | None = None,
        timezone: str | None = None,
    ) -> Athlete:
        if await self.athletes.get_by_email(email):
            raise DuplicateEmailError
        return await self.athletes.create_athlete(
            email, hash_password(password), name, timezone
        )

    async def login(self, email: str, password: str, client_ip: str) -> TokenPair:
        if await self.login_attempts.is_locked(client_ip):
            raise RateLimitError
        athlete = await self.athletes.get_by_email(email)
        if not athlete or not verify_password(password, athlete.password_hash):
            await self.login_attempts.record_failure(client_ip)
            raise InvalidCredentialsError
        await self.login_attempts.clear(client_ip)
        return self._issue_tokens(athlete.id)

    async def refresh(self, refresh_token: str) -> TokenPair:
        athlete_id, jti = await self._refresh_claims(refresh_token)
        if await self.athletes.get_by_id(athlete_id) is None:
            raise InvalidCredentialsError
        await self.revoked_tokens.revoke(jti)
        return self._issue_tokens(athlete_id)

    async def logout(self, refresh_token: str) -> None:
        _, jti = await self._refresh_claims(refresh_token)
        await self.revoked_tokens.revoke(jti)

    async def _refresh_claims(self, token: str) -> tuple[UUID, str]:
        try:
            claims = decode_token(token, self.jwt_secret)
            athlete_id = UUID(str(claims["sub"]))
            jti = str(claims["jti"])
        except (JWTError, KeyError, ValueError) as error:
            raise InvalidCredentialsError from error
        if claims.get("type") != "refresh" or await self.revoked_tokens.is_revoked(jti):
            raise InvalidCredentialsError
        return athlete_id, jti

    def _issue_tokens(self, athlete_id: UUID) -> TokenPair:
        return TokenPair(
            access_token=create_access_token(athlete_id, self.jwt_secret),
            refresh_token=create_refresh_token(athlete_id, self.jwt_secret),
        )
