from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from functools import lru_cache
from types import MappingProxyType
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import providers as provider_operations
from .interviews.interview_loader import (
    DEFAULT_INTERVIEW_PROMPT_ID,
    DEFAULT_TURN_EAGERNESS,
    DEFAULT_TURN_TIMEOUT_SECONDS,
    LYRA_FIRST_MESSAGE,
    InterviewPrompt,
    load_interview_prompts,
)
from .providers import (
    INTERVIEW_PACKET_DYNAMIC_VARIABLE,
    INTERVIEW_PACKET_PLACEHOLDER,
    require_setting,
    validate_provider_model,
)
from .schemas import (
    CreateSessionRequest,
    ElevenLabsSignedUrlResponse,
    HealthResponse,
    InterviewCatalogItem,
    InterviewCatalogResponse,
    KeyframeSessionDetails,
    LiveSessionResponse,
    VoiceAgentDetails,
)
from .session_service import create_live_session
from .settings import (
    DEFAULT_CLIENT_ORIGINS,
    DEFAULT_PROVIDER_TIMEOUT_SECONDS,
    ENV_FILES,
    ROOT_DIR,
    Settings,
)

__all__ = [
    "DEFAULT_CLIENT_ORIGINS",
    "DEFAULT_INTERVIEW_PROMPT_ID",
    "DEFAULT_PROVIDER_TIMEOUT_SECONDS",
    "DEFAULT_TURN_EAGERNESS",
    "DEFAULT_TURN_TIMEOUT_SECONDS",
    "ENV_FILES",
    "INTERVIEW_PACKET_DYNAMIC_VARIABLE",
    "INTERVIEW_PACKET_PLACEHOLDER",
    "LYRA_FIRST_MESSAGE",
    "ROOT_DIR",
    "CreateSessionRequest",
    "ElevenLabsSignedUrlResponse",
    "HealthResponse",
    "InterviewCatalogItem",
    "InterviewCatalogResponse",
    "KeyframeSessionDetails",
    "LiveSessionResponse",
    "Settings",
    "VoiceAgentDetails",
    "app",
    "build_dynamic_elevenlabs_prompt",
    "build_elevenlabs_agent_update_payload",
    "create_keyframe_session",
    "create_session",
    "extract_provider_error",
    "get_elevenlabs_signed_url",
    "parse_provider_body",
    "provider_json",
    "require_setting",
    "sync_elevenlabs_agent",
    "update_elevenlabs_agent",
    "validate_provider_model",
]

SERVICE_NAME = "kfl-system-design-interview"
SKILL_LEVEL_ORDER = {"Intern": 0, "Junior": 1, "Senior": 2}

logger = logging.getLogger(__name__)


@lru_cache
def get_settings() -> Settings:
    # Keep ENV_FILES here so existing embedders can override app.main.ENV_FILES.
    return Settings(_env_file=ENV_FILES)


def build_dynamic_elevenlabs_prompt() -> str:
    return provider_operations.build_dynamic_elevenlabs_prompt()


def build_elevenlabs_agent_update_payload() -> dict[str, Any]:
    return provider_operations.build_elevenlabs_agent_update_payload(
        prompt_builder=build_dynamic_elevenlabs_prompt,
    )


def parse_provider_body(response: httpx.Response) -> Any:
    return provider_operations.parse_provider_body(response)


def extract_provider_error(body: Any, fallback: str) -> str:
    return provider_operations.extract_provider_error(body, fallback)


async def provider_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None,
    error_prefix: str,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    return await provider_operations.provider_json(
        client,
        method,
        url,
        headers,
        payload,
        error_prefix,
        params,
        response_parser=parse_provider_body,
        error_extractor=extract_provider_error,
    )


async def create_keyframe_session(
    client: httpx.AsyncClient,
    api_key: str,
    settings: Settings | None = None,
) -> KeyframeSessionDetails:
    return await provider_operations.create_keyframe_session(
        client,
        api_key,
        settings or get_settings(),
        request_json=provider_json,
        model_validator=validate_provider_model,
    )


async def get_elevenlabs_signed_url(
    client: httpx.AsyncClient,
    api_key: str,
    agent_id: str,
    settings: Settings | None = None,
) -> ElevenLabsSignedUrlResponse:
    return await provider_operations.get_elevenlabs_signed_url(
        client,
        api_key,
        agent_id,
        settings or get_settings(),
        request_json=provider_json,
        model_validator=validate_provider_model,
    )


async def update_elevenlabs_agent(
    client: httpx.AsyncClient,
    api_key: str,
    agent_id: str,
    settings: Settings | None = None,
) -> None:
    await provider_operations.update_elevenlabs_agent(
        client,
        api_key,
        agent_id,
        settings or get_settings(),
        request_json=provider_json,
        payload_builder=build_elevenlabs_agent_update_payload,
    )


async def sync_elevenlabs_agent(
    client: httpx.AsyncClient,
    settings: Settings | None = None,
) -> None:
    await provider_operations.sync_elevenlabs_agent(
        client,
        settings or get_settings(),
        setting_validator=require_setting,
        update_agent=update_elevenlabs_agent,
    )


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[dict[str, object]]:
    prompts = load_interview_prompts()
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
        try:
            await sync_elevenlabs_agent(client, settings)
        except HTTPException as exc:
            raise RuntimeError(f"ElevenLabs startup sync failed: {exc.detail}") from exc
        yield {
            "provider_http_client": client,
            "interview_prompts": MappingProxyType(dict(prompts)),
        }


app = FastAPI(title="KFL System Design Interview API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().client_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def generic_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled API error", exc_info=(type(exc), exc, exc.__traceback__))
    return JSONResponse(status_code=500, content={"error": "Internal server error."})


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, service=SERVICE_NAME)


@app.get(
    "/api/interviews",
    response_model=InterviewCatalogResponse,
    response_model_by_alias=True,
)
async def list_interviews(request: Request) -> InterviewCatalogResponse:
    prompts = get_synced_interview_prompts(request)
    ordered_prompts = sorted(
        prompts.values(),
        key=lambda prompt: (SKILL_LEVEL_ORDER[prompt.skill_level], prompt.question_number),
    )
    return InterviewCatalogResponse(interviews=[public_interview_metadata(prompt) for prompt in ordered_prompts])


@app.post(
    "/api/session",
    response_model=LiveSessionResponse,
    response_model_by_alias=True,
)
async def create_session(
    http_request: Request,
    request: CreateSessionRequest | None = None,
) -> LiveSessionResponse:
    settings = get_settings()
    packet_id = request.packet_id if request is not None else DEFAULT_INTERVIEW_PROMPT_ID
    try:
        prompt = get_synced_interview_prompts(http_request)[packet_id]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown interview packet: {packet_id}") from exc

    return await create_live_session(
        get_provider_http_client(http_request),
        settings,
        prompt,
        setting_validator=require_setting,
        keyframe_session_creator=create_keyframe_session,
        signed_url_provider=get_elevenlabs_signed_url,
    )


def get_provider_http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.state, "provider_http_client", None)
    if client is None:
        raise RuntimeError("Provider HTTP client is not initialized.")
    return client


def get_synced_interview_prompts(request: Request) -> Mapping[str, InterviewPrompt]:
    prompts = getattr(request.state, "interview_prompts", None)
    if prompts is None:
        raise RuntimeError("Interview prompt snapshot is not initialized.")
    return prompts


def public_interview_metadata(prompt: InterviewPrompt) -> InterviewCatalogItem:
    """Build the browser contract from an explicit public-field allowlist."""
    return InterviewCatalogItem(
        packet_id=prompt.prompt_id,
        title=prompt.display_name,
        summary=prompt.summary,
        question_number=prompt.question_number,
        skill_level=prompt.skill_level,
        difficulty=prompt.difficulty,
        focus=list(prompt.focus),
        tags=list(prompt.tags),
    )
