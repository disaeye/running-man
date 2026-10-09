from uuid import UUID

from fastapi import HTTPException, Request, status

from domain.auth.tokens import JWTError, decode_token
from infrastructure.auth.models import Athlete
from infrastructure.auth.repo import AthleteRepo
from infrastructure.auth.settings import settings


async def get_current_athlete(request: Request) -> Athlete:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing access token")
    try:
        claims = decode_token(token, settings.jwt_secret)
        athlete_id = UUID(str(claims["sub"]))
    except (JWTError, KeyError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid access token"
        ) from error
    athlete = await AthleteRepo().get_by_id(athlete_id)
    if not athlete:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="athlete not found")
    return athlete
