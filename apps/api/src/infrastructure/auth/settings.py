from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    database_url: str = ""
    # Required, no default. This key signs the session cookie and keys the stored
    # integration credentials, so a missing value has to stop the process at
    # import time rather than quietly fall back to a publicly known string.
    jwt_secret: str = Field(min_length=32)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# mypy cannot see that pydantic-settings fills a required field from the
# environment, so it reads this call as missing an argument.
settings = AuthSettings()  # type: ignore[call-arg]
