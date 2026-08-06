from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILES: tuple[Path, ...] | None = (ROOT_DIR / ".env",)
DEFAULT_CLIENT_ORIGINS = ["http://localhost:5174"]
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 35.0


class Settings(BaseSettings):
    keyframe_api_key: Optional[str] = Field(default=None, validation_alias="KEYFRAME_API_KEY")
    keyframe_persona_slug: str = Field(
        default="public:lyra_persona-1.5-live",
        validation_alias="KEYFRAME_PERSONA_SLUG",
    )
    elevenlabs_api_key: Optional[str] = Field(default=None, validation_alias="ELEVENLABS_API_KEY")
    elevenlabs_agent_id: Optional[str] = Field(default=None, validation_alias="ELEVENLABS_AGENT_ID")
    elevenlabs_api_base_url: str = Field(
        default="https://api.elevenlabs.io",
        validation_alias="ELEVENLABS_API_BASE_URL",
    )
    client_origin: Optional[str] = Field(default=None, validation_alias="CLIENT_ORIGIN")
    provider_timeout_seconds: float = Field(
        default=DEFAULT_PROVIDER_TIMEOUT_SECONDS,
        gt=0,
        validation_alias="PROVIDER_TIMEOUT_SECONDS",
    )

    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("elevenlabs_api_base_url")
    @classmethod
    def normalize_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def client_origins(self) -> list[str]:
        if not self.client_origin:
            return DEFAULT_CLIENT_ORIGINS

        origins = [origin.strip() for origin in self.client_origin.split(",") if origin.strip()]
        return origins or DEFAULT_CLIENT_ORIGINS


def load_settings(env_files: tuple[Path, ...] | None = ENV_FILES) -> Settings:
    return Settings(_env_file=env_files)
