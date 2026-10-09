from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class Athlete:
    id: UUID
    email: str
    password_hash: str
    name: str = ""
    timezone: str = "UTC"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
