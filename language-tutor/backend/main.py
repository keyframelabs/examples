from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class CreateSessionRequest(ApiModel):
    scenario_id: str


class TranscriptEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["user", "assistant"]
    text: str

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        value = value.copy()
        if value.get("role") == "agent":
            value["role"] = "assistant"
        value["text"] = value.get("text") or value.get("message")
        return value


class Feedback(ApiModel):
    feedback: Literal["Great Job!", "Needs Improvement", "That wasn't nice."]
    input_english: str
    suggestion_spanish: str | None
    suggestion_english: str | None
    reason: str

    @model_validator(mode="after")
    def valid_suggestion(self) -> Feedback:
        expected = self.feedback == "Needs Improvement"
        if (bool(self.suggestion_spanish), bool(self.suggestion_english)) != (expected, expected):
            raise ValueError("Suggestions are required only for Needs Improvement.")
        return self


class EvaluateTurnRequest(ApiModel):
    turn_id: int = Field(ge=1)
    turn: TranscriptEntry
    transcript: list[TranscriptEntry]


class EndSessionRequest(ApiModel):
    transcript: list[TranscriptEntry] = Field(default_factory=list)


@dataclass
class Session:
    scenario: dict[str, str]
    transcript: list[TranscriptEntry] = field(default_factory=list)
    feedback: dict[int, dict[str, Any]] = field(default_factory=dict)
    ended: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


SCENARIOS: dict[str, dict[str, str]] = {
    scenario["scenarioId"]: scenario
    for scenario in [
        {
            "scenarioId": "cafe-order",
            "title": "Order at a café",
            "description": "Practice ordering a drink, asking a question, and paying.",
            "imageUrl": "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=80",
            "prompt": """You are a warm café server in Madrid speaking with a Spanish learner. Stay in Spanish, use short natural turns, and help only when the learner is stuck. Begin by greeting them and asking what they would like. Keep the role-play focused on ordering, preferences, and paying. Near the end, conclude the transaction naturally.""",
        },
        {
            "scenarioId": "market",
            "title": "Shop at a market",
            "description": "Ask about produce, quantities, prices, and recommendations.",
            "imageUrl": "https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80",
            "prompt": """You are a friendly produce vendor in Mexico City speaking with a Spanish learner. Stay in Spanish and use short conversational turns. Begin by asking what they are looking for. Discuss produce, quantities, prices, and one recommendation. Near the end, total the purchase and say goodbye naturally.""",
        },
        {
            "scenarioId": "directions",
            "title": "Ask for directions",
            "description": "Find a museum using landmarks and simple direction words.",
            "imageUrl": "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80",
            "prompt": """You are a helpful local in Barcelona speaking with a Spanish learner who needs directions to a museum. Stay in Spanish, use short natural turns, and ask one clarifying question before giving directions with landmarks. Near the end, confirm they understand and wish them a good visit.""",
        },
    ]
}
SESSIONS: dict[str, Session] = {}

SYSTEM_PROMPT = """Evaluate only the latest learner turn in a spoken Spanish tutoring conversation. Use earlier turns only as context; never continue the conversation or speak as the tutor.

Apply this decision policy in order:
1. Return "That wasn't nice." only when the learner's intent is malicious, threatening, harassing, or demeaning. Profanity, slang, quoted language, and disagreement alone are not malicious. Never suggest a rewrite for malicious content.
2. Return "Needs Improvement" for an empty response; nonsense; a contextually incompatible response; an unresolved "cómo se dice [English]" placeholder; or a definite error in grammar, vocabulary, or expression. A required personal "a" counts as a grammar error.
3. Otherwise return "Great Job!". An acceptable response only needs to be clear, contextually appropriate, and natural enough for everyday speech.

Treat the input as ASR speech. Do not penalize fillers, casing, punctuation, fragments that answer the tutor, interruptions, restarts, topic changes, or abandoned wording followed by a successful self-correction. Accept brief answers, uncertainty such as "no sé", regional variants, informal language, optional articles or pronouns, and minor awkwardness that does not warrant teaching feedback. Do not invent detail or demand a more elaborate or native-sounding answer.

Code-switching alone is not an error. Accept common bilingual discourse markers and English technical terms inside an otherwise coherent response, even when Spanish equivalents exist. Request improvement when a full English clause replaces the Spanish answer, English makes the response unclear, or the learner explicitly signals a vocabulary gap with "cómo se dice [English]". If English is immediately replaced with the correct Spanish word, treat that as a successful self-correction. For an unresolved placeholder, remove "cómo se dice" and replace its English word with the natural Spanish word; for example, "Porque es, cómo se dice easy" becomes "Porque es fácil."

Translate the entire learner response into English as spoken, including errors or nonsense; do not silently correct it. Preserve intent, tone, register, slang, and every substantive detail. For "Needs Improvement", suggest the complete response with only necessary changes in Spanish and English; never summarize it or use ellipses. For the other two labels, both suggestions must be null. Give exactly one short English sentence explaining every label.

Return only the JSON object required by the schema."""


def required_setting(name: str) -> str:
    if not (value := os.getenv(name)):
        raise HTTPException(status_code=503, detail=f"Missing {name}. Add it to .env and restart pnpm dev.")
    return value


async def call_provider(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    error: str,
    required: tuple[str, ...] = (),
    **kwargs: Any,
) -> dict[str, Any]:
    try:
        response = await client.request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{error}: provider request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"{error}: provider request failed.") from exc
    try:
        body = response.json()
    except ValueError:
        body = response.text
    if not response.is_success:
        detail = body
        if isinstance(detail, dict):
            detail = detail.get("detail") or detail.get("message") or detail.get("error") or detail
        if not isinstance(detail, str):
            detail = json.dumps(detail)
        raise HTTPException(status_code=502, detail=f"{error}: {(detail or response.reason_phrase)[:500]}")
    if not isinstance(body, dict) or any(not isinstance(body.get(key), str) for key in required):
        raise HTTPException(status_code=502, detail=f"{error}: provider returned invalid JSON.")
    return body


async def evaluate_turn(client: httpx.AsyncClient, turn_id: int, transcript: list[TranscriptEntry]) -> dict[str, Any]:
    provider_name = os.getenv("OPENROUTER_PROVIDER")
    provider = (
        {
            "order": [provider_name],
            "allow_fallbacks": os.getenv("OPENROUTER_ALLOW_FALLBACKS", "true").lower()
            not in {"0", "false", "no", "off"},
        }
        if provider_name
        else {"sort": "latency"}
    )
    body = await call_provider(
        client,
        "POST",
        "https://openrouter.ai/api/v1/chat/completions",
        "OpenRouter evaluation failed",
        headers={
            "Authorization": f"Bearer {required_setting('OPENROUTER_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={
            "model": os.getenv("OPENROUTER_MODEL", "google/gemma-4-31b-it"),
            "provider": provider,
            "temperature": 0.1,
            "max_tokens": 900,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "spanish_turn_feedback",
                    "strict": True,
                    "schema": Feedback.model_json_schema(by_alias=True),
                },
            },
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "latestLearnerTurn": turn_id,
                            "transcript": [
                                {
                                    "role": "learner" if entry.role == "user" else "tutor",
                                    "message": entry.text,
                                }
                                for entry in transcript
                            ],
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        },
    )
    try:
        content = body["choices"][0]["message"]["content"]
        feedback = Feedback.model_validate_json(content)
        return {"turnId": turn_id, **feedback.model_dump(by_alias=True)}
    except (KeyError, IndexError, TypeError, ValidationError) as exc:
        raise HTTPException(
            status_code=502, detail="OpenRouter evaluation failed: provider returned invalid JSON."
        ) from exc


def get_session(session_id: str) -> Session:
    if session := SESSIONS.get(session_id):
        return session
    raise HTTPException(status_code=404, detail="Session not found.")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with httpx.AsyncClient(timeout=float(os.getenv("PROVIDER_TIMEOUT_SECONDS", "35"))) as client:
        app.state.http_client = client
        yield


app = FastAPI(title="Spanish Language Tutor API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CLIENT_ORIGIN", "http://localhost:5174").split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "language-tutor"}


@app.get("/api/scenarios")
async def scenarios() -> dict[str, Any]:
    return {
        "scenarios": [
            {key: value for key, value in scenario.items() if key != "prompt"} for scenario in SCENARIOS.values()
        ]
    }


@app.post("/api/sessions")
async def create_session(payload: CreateSessionRequest, request: Request) -> dict[str, Any]:
    scenario = SCENARIOS.get(payload.scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Unknown scenario: {payload.scenario_id}")
    agent_id = required_setting("ELEVENLABS_AGENT_ID")
    session_details, signed_url = await asyncio.gather(
        call_provider(
            request.app.state.http_client,
            "POST",
            "https://api.keyframelabs.com/v1/sessions",
            "Keyframe session creation failed",
            ("server_url", "participant_token", "agent_identity"),
            headers={
                "Authorization": f"Bearer {required_setting('KEYFRAME_API_KEY')}",
                "Content-Type": "application/json",
            },
            json={"persona_slug": os.getenv("KEYFRAME_PERSONA_SLUG", "public:lyra_persona-1.5-live")},
        ),
        call_provider(
            request.app.state.http_client,
            "GET",
            f"{os.getenv('ELEVENLABS_API_BASE_URL', 'https://api.elevenlabs.io').rstrip('/')}/v1/convai/conversation/get-signed-url",
            "ElevenLabs signed URL request failed",
            ("signed_url",),
            headers={"xi-api-key": required_setting("ELEVENLABS_API_KEY")},
            params={"agent_id": agent_id},
        ),
    )
    session_id = str(uuid4())
    SESSIONS[session_id] = Session(scenario)
    return {
        "sessionId": session_id,
        "sessionDetails": session_details,
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": agent_id,
            "signed_url": signed_url["signed_url"],
            "dynamic_variables": {"scenario_prompt": scenario["prompt"]},
        },
    }


@app.post("/api/sessions/{session_id}/turns")
async def submit_turn(session_id: str, payload: EvaluateTurnRequest, request: Request) -> dict[str, Any]:
    session = get_session(session_id)
    async with session.lock:
        if session.ended:
            raise HTTPException(status_code=409, detail="Session has already ended.")
        if payload.turn.role != "user":
            raise HTTPException(status_code=422, detail="Only learner turns can be evaluated.")
        if feedback := session.feedback.get(payload.turn_id):
            return feedback
        if payload.turn_id != len(session.feedback) + 1:
            raise HTTPException(status_code=409, detail="Learner turns must be submitted in order.")
        if not payload.turn.text.strip():
            raise HTTPException(status_code=422, detail="Learner turn cannot be empty.")
        transcript = payload.transcript.copy()
        if not transcript or transcript[-1] != payload.turn:
            transcript.append(payload.turn)
        feedback = await evaluate_turn(request.app.state.http_client, payload.turn_id, transcript)
        session.transcript = transcript
        session.feedback[payload.turn_id] = feedback
        return feedback


@app.post("/api/sessions/{session_id}/end")
async def end_session(session_id: str, payload: EndSessionRequest) -> dict[str, Any]:
    session = get_session(session_id)
    async with session.lock:
        if payload.transcript:
            session.transcript = payload.transcript
        session.ended = True
        return {
            "sessionId": session_id,
            "scenario": {key: value for key, value in session.scenario.items() if key != "prompt"},
            "transcript": [entry.model_dump() for entry in session.transcript],
            "feedback": list(session.feedback.values()),
            "ended": True,
        }
