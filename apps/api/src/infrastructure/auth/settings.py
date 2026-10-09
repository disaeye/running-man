from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    database_url: str = ""
    jwt_secret: str = "change-me-to-a-random-secret"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = AuthSettings()
