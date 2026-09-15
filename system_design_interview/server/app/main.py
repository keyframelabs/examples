import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .interviews.interview_loader import DEFAULT_INTERVIEW_PROMPT_ID, load_interview_prompts
from .providers import INTERVIEW_PACKET_DYNAMIC_VARIABLE, create_keyframe_session, get_elevenlabs_signed_url
from .schemas import (
    CreateSessionRequest,
    InterviewCatalogItem,
    InterviewCatalogResponse,
    LiveSessionResponse,
    VoiceAgentDetails,
)
from .settings import ENV_FILES, Settings

SKILL_LEVEL_ORDER = {"Intern": 0, "Junior": 1, "Senior": 2}

logger = logging.getLogger(__name__)


@lru_cache
def get_settings() -> Settings:
    # ENV_FILES is read through this module so tests and embedders can override app.main.ENV_FILES.
    return Settings(_env_file=ENV_FILES)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[dict[str, object]]:
    prompts = load_interview_prompts()
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
        yield {"provider_http_client": client, "interview_prompts": prompts}


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
    logger.error("Unhandled API error", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": "Internal server error."})


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "service": "kfl-system-design-interview"}


@app.get("/api/interviews", response_model=InterviewCatalogResponse)
async def list_interviews(request: Request) -> InterviewCatalogResponse:
    ordered = sorted(
        request.state.interview_prompts.values(),
        key=lambda prompt: (SKILL_LEVEL_ORDER[prompt.metadata.skill_level], prompt.metadata.display_name.casefold()),
    )
    return InterviewCatalogResponse(
        interviews=[
            InterviewCatalogItem(
                packet_id=prompt.prompt_id,
                title=prompt.metadata.display_name,
                skill_level=prompt.metadata.skill_level,
            )
            for prompt in ordered
        ]
    )


@app.post("/api/session", response_model=LiveSessionResponse)
async def create_session(http_request: Request, request: CreateSessionRequest | None = None) -> LiveSessionResponse:
    packet_id = request.packet_id if request is not None else DEFAULT_INTERVIEW_PROMPT_ID
    try:
        prompt = http_request.state.interview_prompts[packet_id]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown interview packet: {packet_id}") from exc

    settings = get_settings()
    keyframe_api_key = require_setting(settings.keyframe_api_key, "KEYFRAME_API_KEY")
    elevenlabs_api_key = require_setting(settings.elevenlabs_api_key, "ELEVENLABS_API_KEY")
    elevenlabs_agent_id = require_setting(settings.elevenlabs_agent_id, "ELEVENLABS_AGENT_ID")
    client = http_request.state.provider_http_client

    session_details, signed_url = await asyncio.gather(
        create_keyframe_session(client, keyframe_api_key, settings),
        get_elevenlabs_signed_url(client, elevenlabs_api_key, elevenlabs_agent_id, settings),
    )

    return LiveSessionResponse(
        session_details=session_details,
        voice_agent_details=VoiceAgentDetails(
            agent_id=elevenlabs_agent_id,
            signed_url=signed_url.signed_url,
            dynamic_variables={INTERVIEW_PACKET_DYNAMIC_VARIABLE: prompt.prompt.strip()},
        ),
    )


def require_setting(value: str | None, name: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {name}. Add it to .env and restart pnpm dev.")
    return value
