from uuid import uuid4

import pytest

from application.auth.service import AuthService, DuplicateEmailError, InvalidCredentialsError
from domain.auth.tokens import decode_token
from infrastructure.auth.models import Athlete

SECRET = "test-secret"


class FakeAthletes:
    def __init__(self) -> None:
        self.by_email: dict[str, Athlete] = {}
        self.by_id: dict[str, Athlete] = {}

    async def create_athlete(
        self,
        email: str,
        password_hash: str,
        name: str | None = None,
        timezone: str | None = None,
    ) -> Athlete:
        athlete = Athlete(
            id=uuid4(),
            email=email,
            password_hash=password_hash,
            name=name or "",
            timezone=timezone or "UTC",
        )
        self.by_email[email] = athlete
        self.by_id[str(athlete.id)] = athlete
        return athlete

    async def get_by_email(self, email: str) -> Athlete | None:
        return self.by_email.get(email)

    async def get_by_id(self, athlete_id):
        return self.by_id.get(str(athlete_id))


class FakeRevoked:
    def __init__(self) -> None:
        self.jtis: set[str] = set()

    async def revoke(self, jti: str) -> None:
        self.jtis.add(jti)

    async def is_revoked(self, jti: str) -> bool:
        return jti in self.jtis


class FakeAttempts:
    async def is_locked(self, _ip: str) -> bool:
        return False

    async def record_failure(self, _ip: str) -> None:
        return None

    async def clear(self, _ip: str) -> None:
        return None


@pytest.fixture
def auth_service() -> AuthService:
    return AuthService(FakeAthletes(), FakeRevoked(), FakeAttempts(), SECRET)


@pytest.mark.no_db
async def test_register_success(auth_service: AuthService) -> None:
    athlete = await auth_service.register("runner@example.com", "secret123")

    assert athlete.email == "runner@example.com"
    assert athlete.password_hash != "secret123"


@pytest.mark.no_db
async def test_register_duplicate_email_fails(auth_service: AuthService) -> None:
    await auth_service.register("runner@example.com", "secret123")

    with pytest.raises(DuplicateEmailError):
        await auth_service.register("runner@example.com", "secret123")


@pytest.mark.no_db
async def test_login_correct_password(auth_service: AuthService) -> None:
    athlete = await auth_service.register("runner@example.com", "secret123")
    tokens = await auth_service.login("runner@example.com", "secret123", "127.0.0.1")

    claims = decode_token(tokens.access_token, SECRET)
    assert claims["sub"] == str(athlete.id)


@pytest.mark.no_db
async def test_login_wrong_password_fails(auth_service: AuthService) -> None:
    await auth_service.register("runner@example.com", "secret123")

    with pytest.raises(InvalidCredentialsError):
        await auth_service.login("runner@example.com", "wrong", "127.0.0.1")


@pytest.mark.no_db
async def test_refresh_rotates_token(auth_service: AuthService) -> None:
    await auth_service.register("runner@example.com", "secret123")
    first = await auth_service.login("runner@example.com", "secret123", "127.0.0.1")

    second = await auth_service.refresh(first.refresh_token)

    assert second.refresh_token != first.refresh_token


@pytest.mark.no_db
async def test_refresh_replay_old_token_fails(auth_service: AuthService) -> None:
    await auth_service.register("runner@example.com", "secret123")
    first = await auth_service.login("runner@example.com", "secret123", "127.0.0.1")
    await auth_service.refresh(first.refresh_token)

    with pytest.raises(InvalidCredentialsError):
        await auth_service.refresh(first.refresh_token)


@pytest.mark.no_db
async def test_logout_revokes_token(auth_service: AuthService) -> None:
    await auth_service.register("runner@example.com", "secret123")
    tokens = await auth_service.login("runner@example.com", "secret123", "127.0.0.1")
    await auth_service.logout(tokens.refresh_token)

    with pytest.raises(InvalidCredentialsError):
        await auth_service.refresh(tokens.refresh_token)


class TestRegisterPassesProfileThrough:
    """Registration must carry the two fields it is given.

    Two defects lived here. The API's `RegisterRequest` declared
    `extra="forbid"` and listed only email and password while the form had
    always sent a name, so every signup through the UI failed with 422. And even
    the requests that did succeed stored the DB default timezone `UTC`, which
    puts an athlete's training day up to eight hours off — a 07:43 run in
    Asia/Shanghai belongs to that day, not the one before it, and nothing in the
    data would say the day key was wrong.
    """

    async def test_stores_the_supplied_name(self) -> None:
        athletes = FakeAthletes()
        service = AuthService(athletes, FakeRevoked(), FakeAttempts(), SECRET)

        athlete = await service.register("a@b.c", "password123", "张三")

        assert athlete.name == "张三"

    async def test_stores_the_supplied_timezone(self) -> None:
        athletes = FakeAthletes()
        service = AuthService(athletes, FakeRevoked(), FakeAttempts(), SECRET)

        athlete = await service.register("a@b.c", "password123", None, "Asia/Shanghai")

        assert athlete.timezone == "Asia/Shanghai"

    async def test_falls_back_to_the_defaults_when_omitted(self) -> None:
        # Kept working so a client that sends only credentials still registers.
        athletes = FakeAthletes()
        service = AuthService(athletes, FakeRevoked(), FakeAttempts(), SECRET)

        athlete = await service.register("a@b.c", "password123")

        assert athlete.timezone == "UTC"
