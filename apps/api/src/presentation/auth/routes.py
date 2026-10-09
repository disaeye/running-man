from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from application.auth.service import (
    AuthService,
    DuplicateEmailError,
    InvalidCredentialsError,
    RateLimitError,
)
from domain.auth.constants import ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
from infrastructure.auth.models import Athlete
from infrastructure.auth.repo import AthleteRepo, LoginAttemptRepo, RevokedTokenRepo
from infrastructure.auth.settings import settings
from infrastructure.repositories.account import AccountRepo
from presentation.api.account_contracts import AccountDeleteResponse
from presentation.auth.deps import get_current_athlete
from presentation.errors import ConflictError

from .schemas import AthleteResponse, LoginRequest, LoginResponse, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])
ACCESS_COOKIE_SECONDS = ACCESS_TOKEN_EXPIRE_MINUTES * 60
REFRESH_COOKIE_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def get_auth_service() -> AuthService:
    return AuthService(AthleteRepo(), RevokedTokenRepo(), LoginAttemptRepo(), settings.jwt_secret)


def get_account_repo() -> AccountRepo:
    return AccountRepo()


@router.post("/register", response_model=AthleteResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> AthleteResponse:
    try:
        athlete = await service.register(
            payload.email, payload.password, payload.name, payload.timezone
        )
    except DuplicateEmailError as error:
        raise ConflictError("email already exists") from error
    return AthleteResponse(athlete_id=str(athlete.id))


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    try:
        tokens = await service.login(payload.email, payload.password, client_ip)
    except RateLimitError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="login locked"
        ) from error
    except InvalidCredentialsError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
        ) from error
    _set_token_cookies(
        response,
        tokens.access_token,
        tokens.refresh_token,
        secure=_is_secure_request(request),
    )
    return LoginResponse()


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="missing refresh token"
        )
    try:
        tokens = await service.refresh(token)
    except InvalidCredentialsError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token"
        ) from error
    _set_token_cookies(
        response,
        tokens.access_token,
        tokens.refresh_token,
        secure=_is_secure_request(request),
    )
    return LoginResponse()


@router.post("/logout", response_model=LoginResponse)
async def logout(
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    token = request.cookies.get("refresh_token")
    if token:
        await service.logout(token)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return LoginResponse()


@router.delete("/delete-account", response_model=AccountDeleteResponse)
async def delete_account(
    response: Response,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[AccountRepo, Depends(get_account_repo)],
) -> AccountDeleteResponse:
    if not await repo.delete(athlete.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="athlete not found")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return AccountDeleteResponse()


def _is_secure_request(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "").lower()
    return proto == "https" or request.url.scheme == "https"


def _set_token_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    secure: bool = False,
) -> None:
    response.set_cookie(
        "access_token",
        access_token,
        max_age=ACCESS_COOKIE_SECONDS,
        path="/",
        httponly=True,
        secure=secure,
        samesite="lax",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        max_age=REFRESH_COOKIE_SECONDS,
        path="/",
        httponly=True,
        secure=secure,
        samesite="lax",
    )
