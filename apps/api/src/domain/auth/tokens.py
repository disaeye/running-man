from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt

from .constants import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, REFRESH_TOKEN_EXPIRE_DAYS

JWTError = jwt.PyJWTError


def create_access_token(athlete_id: UUID, secret: str) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(athlete_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


def create_refresh_token(athlete_id: UUID, secret: str) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(athlete_id),
        "type": "refresh",
        "jti": str(uuid4()),
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, secret: str) -> dict[str, object]:
    return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
