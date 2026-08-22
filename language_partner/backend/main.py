from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from time import monotonic
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.models import (
    AppSettings,
    CreateSessionRequest,
    EndSessionRequest,
    EvaluateTurnRequest,
    Session,
    SuggestedResponseRequest,
    TranslateTranscriptRequest,
)
from backend.prompts.loader import Prompts, Scenario, load_prompts
from backend.providers import (
    create_keyframe_session,
    evaluate_turn,
    get_elevenlabs_url,
    required,
    suggest_response,
    translate_transcript,
)

TIMEOUT = httpx.Timeout(connect=10, read=90, write=10, pool=10)
SESSION_TTL_SECONDS = 15 * 60
SESSION_CLEANUP_INTERVAL_SECONDS = 60


@dataclass(slots=True)
class Resources:
    settings: AppSettings
    prompts: Prompts
    sessions: dict[str, Session]
    client: httpx.AsyncClient


def resources(request: Request) -> Resources:
    return request.app.state.resources


def active_session(state: Resources, session_id: str) -> Session:
    session = state.sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found.")
    session.last_activity = monotonic()
    return session


async def expire_sessions(sessions: dict[str, Session]) -> None:
    while True:
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)
        cutoff = monotonic() - SESSION_TTL_SECONDS
        for session_id, session in list(sessions.items()):
            if session.last_activity < cutoff:
                sessions.pop(session_id, None)


def create_app(settings: AppSettings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or AppSettings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        prompts = load_prompts()
        async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as client:
            state = Resources(settings, prompts, {}, client)
            app.state.resources = state
            cleanup = asyncio.create_task(expire_sessions(state.sessions))
            try:
                yield
            finally:
                cleanup.cancel()
                with suppress(asyncio.CancelledError):
                    await cleanup

    app = FastAPI(title="Spanish Language Partner API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.client_origins if origin.strip()],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse({"error": "Invalid request."}, status_code=422)

    @app.get("/health")
    async def health() -> dict[str, bool | str]:
        return {"ok": True, "service": "language-tutor"}

    @app.get("/api/scenarios")
    async def scenarios(request: Request) -> dict[str, list[dict[str, str]]]:
        ordered = sorted(
            resources(request).prompts.scenarios.values(),
            key=lambda item: (item.title.casefold(), item.scenario_id),
        )
        return {"scenarios": [{"scenarioId": item.scenario_id, "title": item.title} for item in ordered]}

    @app.post("/api/sessions")
    async def create_session(payload: CreateSessionRequest, request: Request) -> dict[str, Any]:
        state = resources(request)
        scenario = state.prompts.scenarios.get(payload.scenario_id)
        if not scenario:
            raise HTTPException(404, f"Unknown scenario: {payload.scenario_id}")
        keyframe_key = required("KEYFRAME_API_KEY", state.settings.keyframe_api_key)
        elevenlabs_key = required("ELEVENLABS_API_KEY", state.settings.elevenlabs_api_key)
        agent_id = required("ELEVENLABS_AGENT_ID", state.settings.elevenlabs_agent_id)
        signed_url, session_details = await asyncio.gather(
            get_elevenlabs_url(state.client, state.settings, elevenlabs_key, agent_id),
            create_keyframe_session(state.client, keyframe_key, state.settings.keyframe_persona_slug),
        )
        session_id = str(uuid4())
        state.sessions[session_id] = Session(scenario.scenario_id)
        scenario_prompt = f"{scenario.prompt}\n\n{state.prompts.elevenlabs_policy}"
        return {
            "sessionId": session_id,
            "persona": {
                "sessionDetails": session_details,
                "voiceAgentDetails": {
                    "type": "elevenlabs",
                    "agent_id": agent_id,
                    "signed_url": signed_url,
                },
                "dynamicVariables": {
                    "scenario_prompt": scenario_prompt,
                    "scenario_opening_message": scenario.opening_message,
                },
            },
        }

    @app.post("/api/sessions/{session_id}/turns")
    async def submit_turn(session_id: str, payload: EvaluateTurnRequest, request: Request) -> dict[str, Any]:
        state = resources(request)
        session = active_session(state, session_id)
        cached = session.feedback.get(payload.turn_id)
        if cached is not None:
            return {"turnId": payload.turn_id, **cached.model_dump(by_alias=True)}
        if not any(entry.role == "user" for entry in payload.transcript):
            raise HTTPException(422, "The transcript must contain a learner turn.")
        feedback = await evaluate_turn(
            state.client,
            state.settings,
            payload.turn_id,
            payload.transcript,
            state.prompts.evaluation,
        )
        session.feedback[payload.turn_id] = feedback
        return {"turnId": payload.turn_id, **feedback.model_dump(by_alias=True)}

    @app.post("/api/sessions/{session_id}/translations")
    async def translate_avatar_transcript(
        session_id: str,
        payload: TranslateTranscriptRequest,
        request: Request,
    ) -> dict[str, Any]:
        state = resources(request)
        session = active_session(state, session_id)
        cached = session.translations.get(payload.text)
        if cached is not None:
            return cached.model_dump(by_alias=True)
        translation = await translate_transcript(
            state.client,
            state.settings,
            payload.text,
            state.prompts.translation,
        )
        session.translations[payload.text] = translation
        return translation.model_dump(by_alias=True)

    @app.post("/api/sessions/{session_id}/suggestions")
    async def suggest_learner_response(
        session_id: str,
        payload: SuggestedResponseRequest,
        request: Request,
    ) -> dict[str, Any]:
        state = resources(request)
        session = active_session(state, session_id)
        if not any(entry.role == "assistant" for entry in payload.transcript):
            raise HTTPException(422, "The transcript must contain a tutor turn.")
        cache_key = json.dumps(
            [entry.model_dump() for entry in payload.transcript],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        cached = session.suggestions.get(cache_key)
        if cached is not None:
            return cached.model_dump(by_alias=True)
        suggestion = await suggest_response(
            state.client,
            state.settings,
            state.prompts.scenarios[session.scenario_id],
            payload.transcript,
            [item.response for item in session.suggestions.values()],
            state.prompts.suggestion,
        )
        session.suggestions[cache_key] = suggestion
        return suggestion.model_dump(by_alias=True)

    @app.post("/api/sessions/{session_id}/end")
    async def end_session(session_id: str, payload: EndSessionRequest, request: Request) -> dict[str, Any]:
        state = resources(request)
        session = state.sessions.pop(session_id, None)
        if not session:
            raise HTTPException(404, "Session not found.")
        feedback = dict(sorted(session.feedback.items()))
        turns = [entry for entry in payload.transcript if entry.role == "user"]
        scenario: Scenario = state.prompts.scenarios[session.scenario_id]
        return {
            "scenarioId": scenario.scenario_id,
            "scenarioTitle": scenario.title,
            "learnerTurns": [
                {
                    "turnId": turn_id,
                    "text": entry.text,
                    "feedback": feedback[turn_id].model_dump(by_alias=True) if turn_id in feedback else None,
                }
                for turn_id, entry in enumerate(turns, 1)
            ],
        }

    return app


app = create_app()
