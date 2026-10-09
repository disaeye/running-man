from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WebhookSettings(BaseSettings):
    webhook_secret_env: str = Field(default="", validation_alias="WEBHOOK_SECRET")
    intervals_icu_webhook_secret: str = "test-secret"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def webhook_secret(self) -> str:
        return self.webhook_secret_env or self.intervals_icu_webhook_secret or "test-secret"


settings = WebhookSettings()
