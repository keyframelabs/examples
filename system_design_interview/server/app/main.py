from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT_DIR / "server"
PROVIDER_REQUEST_TIMEOUT_SECONDS = 35
DEFAULT_CLIENT_ORIGINS = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


def load_env() -> None:
    for env_path in [ROOT_DIR / ".env", SERVER_DIR / ".env"]:
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_env()


def client_origins() -> list[str]:
    raw = os.environ.get("CLIENT_ORIGIN")
    if not raw:
        return DEFAULT_CLIENT_ORIGINS

    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="KFL System Design Interview API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=client_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error_handler(_request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def generic_error_handler(_request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kfl-system-design-interview",
    }


@app.post("/api/session")
async def create_session() -> dict[str, Any]:
    keyframe_api_key = require_env("KEYFRAME_API_KEY")
    elevenlabs_api_key = require_env("ELEVENLABS_API_KEY")
    elevenlabs_agent_id = require_env("ELEVENLABS_AGENT_ID")

    await update_elevenlabs_agent(elevenlabs_api_key, elevenlabs_agent_id)

    session_details, signed_url = await asyncio.gather(
        create_keyframe_session(keyframe_api_key),
        get_elevenlabs_signed_url(elevenlabs_api_key, elevenlabs_agent_id),
    )

    return {
        "sessionDetails": session_details,
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": elevenlabs_agent_id,
            "signed_url": signed_url["signed_url"],
            "dynamic_variables": {
                "interviewer_name": "Lyra",
                "interview_type": "system design",
                "canvas_context_format": "Serialized Canvas v8 architecture text",
            },
        },
        "conversationId": signed_url.get("conversation_id"),
    }


async def create_keyframe_session(api_key: str) -> dict[str, Any]:
    persona_slug = os.environ.get("KEYFRAME_PERSONA_SLUG", "public:lyra_persona-1.5-live")
    body = await provider_json(
        "POST",
        "https://api.keyframelabs.com/v1/sessions",
        {"Authorization": f"Bearer {api_key}"},
        {"persona_slug": persona_slug},
        "Keyframe session creation failed",
    )

    for key in ["server_url", "participant_token", "agent_identity"]:
        if not isinstance(body.get(key), str):
            raise HTTPException(status_code=502, detail=f"Keyframe response missing {key}.")

    return body


async def get_elevenlabs_signed_url(api_key: str, agent_id: str) -> dict[str, Any]:
    base_url = elevenlabs_api_base_url()
    body = await provider_json(
        "GET",
        f"{base_url}/v1/convai/conversation/get-signed-url",
        {"xi-api-key": api_key},
        None,
        "ElevenLabs signed URL request failed",
        params={
            "agent_id": agent_id,
            "include_conversation_id": "true",
        },
    )

    if not isinstance(body.get("signed_url"), str):
        raise HTTPException(status_code=502, detail="ElevenLabs response missing signed_url.")

    return body


async def update_elevenlabs_agent(api_key: str, agent_id: str) -> None:
    base_url = elevenlabs_api_base_url()
    base = httpx.URL(base_url)
    agent_url = base.copy_with(path=f"{base.path.rstrip('/')}/v1/convai/agents/{agent_id}")
    await provider_json(
        "PATCH",
        agent_url,
        {"xi-api-key": api_key},
        build_elevenlabs_agent_update_payload(),
        "ElevenLabs agent update failed",
    )


def build_elevenlabs_agent_update_payload() -> dict[str, Any]:
    return {
        "conversation_config": {
            "agent": {
                "first_message": (
                    "Hi, I'm Lyra. Let's run a system design interview. "
                    "What product or capability should we design today?"
                ),
                "disable_first_message_interruptions": True,
                "prompt": {
                    "prompt": build_system_design_interviewer_prompt(),
                },
            }
        }
    }


def build_system_design_interviewer_prompt() -> str:
    return "\n".join([
        "You are Lyra, a senior system design interviewer shown through a Keyframe Labs live avatar.",
        "Keyframe Labs is only the video avatar provider. You are interviewing the human candidate.",
        "Run a realistic system design interview: clarify requirements, guide scope, discuss APIs, data model, architecture, scaling, reliability, observability, tradeoffs, and bottlenecks.",
        "The candidate is drawing on an infinite canvas. You will receive contextual_update events containing the latest serialized Canvas v8 state.",
        "Treat the newest canvas contextual update as the current architecture diagram and use it as background context in the next natural turn.",
        "Do not immediately respond just because a contextual update arrives. Wait for the conversation turn.",
        "When useful, refer to concrete services, databases, tables, labels, and connections from the canvas.",
        "Ask one question at a time. Keep turns concise and interview-like.",
        "If the design is underspecified, ask about requirements or constraints before proposing solutions.",
        "If the candidate adds or changes canvas elements, acknowledge the design direction and ask a deeper tradeoff or failure-mode question.",
        "Use the end_call tool only when the candidate is done and you have wrapped up feedback.",
    ])


async def provider_json(
    method: str,
    url: str | httpx.URL,
    headers: dict[str, str],
    payload: dict[str, Any] | None,
    error_prefix: str,
    *,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                url,
                headers=headers,
                params=params,
                json=payload,
                timeout=PROVIDER_REQUEST_TIMEOUT_SECONDS,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{error_prefix}: provider request timed out.") from exc
    except httpx.RequestError as exc:
        message = str(exc) or "provider request failed."
        raise HTTPException(status_code=502, detail=f"{error_prefix}: {message}") from exc

    body = parse_provider_body(response)

    if not response.is_success:
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
    except json.JSONDecodeError:
        return response.text or None


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


def elevenlabs_api_base_url() -> str:
    return os.environ.get("ELEVENLABS_API_BASE_URL", "https://api.elevenlabs.io").rstrip("/")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {name}. Add it to .env and restart pnpm dev.")
    return value
