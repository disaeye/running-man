from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WebhookSettings(BaseSettings):
    # Required, no default. A fallback literal here is a published password: the
    # endpoint compares the request body against it, so anyone who reads the
    # source can drive the webhook handler.
    webhook_secret: str = Field(min_length=16, validation_alias="WEBHOOK_SECRET")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# mypy cannot see that pydantic-settings fills a required field from the
# environment, so it reads this call as missing an argument.
settings = WebhookSettings()  # type: ignore[call-arg]
