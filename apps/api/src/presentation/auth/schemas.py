from pydantic import BaseModel, ConfigDict, Field


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    email: str
    password: str = Field(min_length=8)
    # The form has always sent a name, but this model declared
    # `extra="forbid"` and only listed email and password, so every signup
    # through the UI failed with 422. Accepting it is the fix; the frontend was
    # not sending anything unexpected.
    name: str | None = None
    # The browser knows the athlete's timezone and the server does not — the
    # server would otherwise stamp the DB default (UTC), putting the training
    # day up to eight hours off for an athlete in Asia/Shanghai until they find
    # the setting.
    timezone: str | None = None


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    email: str
    password: str


class AthleteResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    athlete_id: str


class LoginResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool = True
