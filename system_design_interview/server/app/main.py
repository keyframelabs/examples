from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional, TypeVar

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILES: tuple[Path, ...] | None = (ROOT_DIR / ".env",)
DEFAULT_CLIENT_ORIGINS = [
    "http://localhost:5174",
]
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 35.0
SERVICE_NAME = "kfl-system-design-interview"

logger = logging.getLogger(__name__)
ModelT = TypeVar("ModelT", bound=BaseModel)


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


class HealthResponse(BaseModel):
    ok: bool
    service: str


class KeyframeSessionDetails(BaseModel):
    model_config = ConfigDict(extra="allow")

    server_url: str
    participant_token: str
    agent_identity: str


class ElevenLabsSignedUrlResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    signed_url: str
    conversation_id: Optional[str] = None


class VoiceAgentDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider_type: Literal["elevenlabs"] = Field(default="elevenlabs", alias="type")
    agent_id: str
    signed_url: str
    dynamic_variables: dict[str, str]


class LiveSessionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_details: KeyframeSessionDetails = Field(alias="sessionDetails")
    voice_agent_details: VoiceAgentDetails = Field(alias="voiceAgentDetails")
    conversation_id: Optional[str] = Field(default=None, alias="conversationId")


@lru_cache
def get_settings() -> Settings:
    return Settings(_env_file=ENV_FILES)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
        app.state.provider_http_client = client
        yield
    if hasattr(app.state, "provider_http_client"):
        delattr(app.state, "provider_http_client")


app = FastAPI(title="KFL System Design Interview API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().client_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error_handler(_request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def generic_error_handler(_request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled API error", exc_info=(type(exc), exc, exc.__traceback__))
    return JSONResponse(status_code=500, content={"error": "Internal server error."})


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, service=SERVICE_NAME)


@app.post(
    "/api/session",
    response_model=LiveSessionResponse,
    response_model_by_alias=True,
)
async def create_session() -> LiveSessionResponse:
    settings = get_settings()
    keyframe_api_key = require_setting(settings.keyframe_api_key, "KEYFRAME_API_KEY")
    elevenlabs_api_key = require_setting(settings.elevenlabs_api_key, "ELEVENLABS_API_KEY")
    elevenlabs_agent_id = require_setting(settings.elevenlabs_agent_id, "ELEVENLABS_AGENT_ID")
    client = get_provider_http_client()

    session_details, signed_url = await asyncio.gather(
        create_keyframe_session(client, keyframe_api_key, settings),
        get_elevenlabs_signed_url(client, elevenlabs_api_key, elevenlabs_agent_id, settings),
    )

    return LiveSessionResponse(
        session_details=session_details,
        voice_agent_details=VoiceAgentDetails(
            agent_id=elevenlabs_agent_id,
            signed_url=signed_url.signed_url,
            dynamic_variables={
                "interviewer_name": "Lyra",
                "interview_type": "system design",
                "canvas_context_format": "Serialized canvas architecture text",
            },
        ),
        conversation_id=signed_url.conversation_id,
    )


def get_provider_http_client() -> httpx.AsyncClient:
    client = getattr(app.state, "provider_http_client", None)
    if client is None:
        raise RuntimeError("Provider HTTP client is not initialized.")
    return client


async def create_keyframe_session(
    client: httpx.AsyncClient,
    api_key: str,
    settings: Settings | None = None,
) -> KeyframeSessionDetails:
    settings = settings or get_settings()
    body = await provider_json(
        client,
        "POST",
        "https://api.keyframelabs.com/v1/sessions",
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        {"persona_slug": settings.keyframe_persona_slug},
        "Keyframe session creation failed",
    )

    return validate_provider_model(KeyframeSessionDetails, body, "Keyframe session creation failed")


async def get_elevenlabs_signed_url(
    client: httpx.AsyncClient,
    api_key: str,
    agent_id: str,
    settings: Settings | None = None,
) -> ElevenLabsSignedUrlResponse:
    settings = settings or get_settings()
    body = await provider_json(
        client,
        "GET",
        f"{settings.elevenlabs_api_base_url}/v1/convai/conversation/get-signed-url",
        {"xi-api-key": api_key},
        None,
        "ElevenLabs signed URL request failed",
        params={
            "agent_id": agent_id,
            "include_conversation_id": "true",
        },
    )

    return validate_provider_model(ElevenLabsSignedUrlResponse, body, "ElevenLabs signed URL request failed")


async def provider_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None,
    error_prefix: str,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    try:
        request_kwargs: dict[str, Any] = {"headers": headers}
        if params is not None:
            request_kwargs["params"] = params
        if payload is not None:
            request_kwargs["json"] = payload

        response = await client.request(method, url, **request_kwargs)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{error_prefix}: provider request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"{error_prefix}: {exc}") from exc

    body = parse_provider_body(response)
    if not 200 <= response.status_code < 300:
        detail = extract_provider_error(body, response.reason_phrase or "provider error")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"{error_prefix}: {detail}",
        )

    if body is None:
        return {}

    if isinstance(body, dict):
        return body

    raise HTTPException(status_code=502, detail=f"{error_prefix}: provider returned unexpected JSON.")


def parse_provider_body(response: httpx.Response) -> Any:
    if not response.content:
        return None

    try:
        return response.json()
    except ValueError:
        return response.text


def validate_provider_model(model_type: type[ModelT], body: dict[str, Any], error_prefix: str) -> ModelT:
    try:
        return model_type.model_validate(body)
    except ValidationError as exc:
        missing_fields = [
            ".".join(str(part) for part in error["loc"]) for error in exc.errors() if error.get("type") == "missing"
        ]
        if missing_fields:
            detail = f"provider response missing {', '.join(missing_fields)}."
        else:
            detail = "provider returned invalid JSON."
        raise HTTPException(status_code=502, detail=f"{error_prefix}: {detail}") from exc


def extract_provider_error(body: Any, fallback: str) -> str:
    if body is None:
        return fallback

    if isinstance(body, dict):
        detail = body.get("detail") or body.get("message") or body.get("error")
        if isinstance(detail, str):
            return detail
        if detail is not None:
            return json.dumps(detail)

    if isinstance(body, str):
        return body[:500]

    return fallback


def require_setting(value: str | None, name: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {name}. Add it to .env and restart pnpm dev.")
    return value
