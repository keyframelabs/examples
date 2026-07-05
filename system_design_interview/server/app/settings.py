from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the system_design_interview directory root, two levels above server/app/.
ENV_FILES: tuple[Path, ...] | None = (Path(__file__).resolve().parents[2] / ".env",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True)

    keyframe_api_key: str | None = Field(default=None, validation_alias="KEYFRAME_API_KEY")
    keyframe_persona_slug: str = Field(
        default="public:lyra_persona-1.5-live",
        validation_alias="KEYFRAME_PERSONA_SLUG",
    )
    elevenlabs_api_key: str | None = Field(default=None, validation_alias="ELEVENLABS_API_KEY")
    elevenlabs_agent_id: str | None = Field(default=None, validation_alias="ELEVENLABS_AGENT_ID")
    elevenlabs_api_base_url: str = Field(
        default="https://api.elevenlabs.io",
        validation_alias="ELEVENLABS_API_BASE_URL",
    )
    client_origin: str | None = Field(default=None, validation_alias="CLIENT_ORIGIN")
    provider_timeout_seconds: float = Field(default=35.0, gt=0, validation_alias="PROVIDER_TIMEOUT_SECONDS")

    @field_validator("elevenlabs_api_base_url")
    @classmethod
    def normalize_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def client_origins(self) -> list[str]:
        origins = [origin.strip() for origin in (self.client_origin or "").split(",") if origin.strip()]
        return origins or ["http://localhost:5174"]
