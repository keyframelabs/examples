from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from functools import lru_cache
from types import MappingProxyType

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import session_service
from .interviews.interview_loader import (
    DEFAULT_INTERVIEW_PROMPT_ID,
    InterviewPrompt,
    load_interview_prompts,
)
from .schemas import (
    CreateSessionRequest,
    HealthResponse,
    InterviewCatalogItem,
    InterviewCatalogResponse,
    LiveSessionResponse,
)
from .settings import ENV_FILES, Settings

SERVICE_NAME = "kfl-system-design-interview"
SKILL_LEVEL_ORDER = {"Intern": 0, "Junior": 1, "Senior": 2}

logger = logging.getLogger(__name__)


@lru_cache
def get_settings() -> Settings:
    # Keep ENV_FILES here so existing embedders can override app.main.ENV_FILES.
    return Settings(_env_file=ENV_FILES)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[dict[str, object]]:
    prompts = load_interview_prompts()
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
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
        key=lambda prompt: (
            SKILL_LEVEL_ORDER[prompt.skill_level],
            prompt.display_name.casefold(),
            prompt.display_name,
            prompt.prompt_id,
        ),
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

    return await session_service.create_live_session(get_provider_http_client(http_request), settings, prompt)


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
        skill_level=prompt.skill_level,
    )
