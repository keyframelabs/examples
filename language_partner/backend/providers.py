from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from backend.models import (
    AppSettings,
    Feedback,
    SuggestedResponse,
    TranscriptEntry,
    TranscriptTranslation,
)
from backend.prompts.loader import Scenario

logger = logging.getLogger(__name__)
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
UNSUPPORTED_STRICT_SCHEMA_KEYS = {
    "format",
    "maxItems",
    "maxLength",
    "minItems",
    "minLength",
    "pattern",
    "title",
}


def required(name: str, value: str | None) -> str:
    if value and value.strip():
        return value.strip()
    raise HTTPException(503, f"Missing {name}. Add it to .env and restart pnpm dev.")


def _provider_failure(service: str, status_code: int) -> str:
    if status_code == 401:
        return f"{service} authentication failed. Check the configured API key."
    if status_code == 403:
        return f"{service} denied access. Check account and resource permissions."
    if status_code == 404:
        return f"{service} resource was not found. Check the configured resource ID or slug."
    if status_code in {400, 422}:
        return f"{service} rejected the request. Check provider configuration."
    if status_code == 429:
        return f"{service} limit reached. Wait, then retry or check account limits."
    if status_code >= 500:
        return f"{service} is temporarily unavailable. Retry shortly."
    return f"{service} request failed (HTTP {status_code})."


async def request_json(
    client: httpx.AsyncClient,
    service: str,
    method: str,
    url: str,
    **kwargs: Any,
) -> dict[str, Any]:
    try:
        response = await client.request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        logger.warning("%s request timed out", service)
        raise HTTPException(504, f"{service} request timed out. Retry shortly.") from exc
    except httpx.HTTPError as exc:
        logger.warning("%s request failed", service)
        raise HTTPException(502, f"{service} could not be reached. Check the server network and retry.") from exc
    if not response.is_success:
        logger.warning("%s returned HTTP %s", service, response.status_code)
        raise HTTPException(502, _provider_failure(service, response.status_code))
    try:
        body = response.json()
    except ValueError as exc:
        logger.warning("%s returned invalid JSON", service)
        raise HTTPException(502, f"{service} returned an invalid response.") from exc
    if not isinstance(body, dict):
        logger.warning("%s returned a non-object response", service)
        raise HTTPException(502, f"{service} returned an invalid response.")
    return body


async def create_keyframe_session(
    client: httpx.AsyncClient,
    api_key: str,
    slug: str,
) -> dict[str, str]:
    body = await request_json(
        client,
        "Keyframe",
        "POST",
        "https://api.keyframelabs.com/v1/sessions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"persona_slug": slug},
    )
    server_url = body.get("server_url")
    participant_token = body.get("participant_token")
    agent_identity = body.get("agent_identity")
    if not all(isinstance(value, str) and value for value in (server_url, participant_token, agent_identity)):
        logger.warning("Keyframe returned invalid session details")
        raise HTTPException(502, "Keyframe session creation failed: provider returned an invalid response.")
    return {
        "server_url": server_url,
        "participant_token": participant_token,
        "agent_identity": agent_identity,
    }


async def get_elevenlabs_url(
    client: httpx.AsyncClient,
    settings: AppSettings,
    api_key: str,
    agent_id: str,
) -> str:
    body = await request_json(
        client,
        "ElevenLabs",
        "GET",
        f"{settings.elevenlabs_api_base_url.rstrip('/')}/v1/convai/conversation/get-signed-url",
        headers={"xi-api-key": api_key},
        params={"agent_id": agent_id},
    )
    signed_url = body.get("signed_url")
    if not isinstance(signed_url, str) or not signed_url:
        logger.warning("ElevenLabs returned an invalid signed URL")
        raise HTTPException(502, "ElevenLabs signed URL request failed: provider returned an invalid response.")
    return signed_url


def _provider(settings: AppSettings) -> dict[str, Any]:
    provider: dict[str, Any] = {
        "allow_fallbacks": settings.openrouter_allow_fallbacks,
        "require_parameters": True,
    }
    if settings.openrouter_provider:
        provider["order"] = [settings.openrouter_provider]
    else:
        provider["sort"] = "latency"
    return provider


def _schema(name: str, model: type[BaseModel]) -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": _strict_schema(model.model_json_schema(by_alias=True)),
        },
    }


def _strict_schema(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _strict_schema(item) for key, item in value.items() if key not in UNSUPPORTED_STRICT_SCHEMA_KEYS}
    if isinstance(value, list):
        return [_strict_schema(item) for item in value]
    return value


async def _completion(
    client: httpx.AsyncClient,
    settings: AppSettings,
    *,
    model: str,
    prompt: str,
    user_data: dict[str, Any],
    schema_name: str,
    schema_model: type[BaseModel],
    max_tokens: int,
    operation: str,
    reasoning: bool | None = None,
) -> str:
    body = await request_json(
        client,
        "OpenRouter",
        "POST",
        OPENROUTER_URL,
        headers={"Authorization": f"Bearer {required('OPENROUTER_API_KEY', settings.openrouter_api_key)}"},
        json={
            "model": model,
            "provider": _provider(settings),
            "temperature": 0.1,
            "max_tokens": max_tokens,
            "response_format": _schema(schema_name, schema_model),
            **({"reasoning": {"enabled": reasoning}} if reasoning is not None else {}),
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(user_data, ensure_ascii=False)},
            ],
        },
    )
    try:
        choice = body["choices"][0]
        content = choice["message"]["content"]
        invalid = (
            body.get("error") is not None or choice.get("error") is not None or choice.get("finish_reason") == "error"
        )
        if invalid or not isinstance(content, str):
            raise ValueError
    except (AttributeError, IndexError, KeyError, TypeError, ValueError) as exc:
        logger.warning("OpenRouter returned an invalid %s completion", operation)
        raise HTTPException(502, f"OpenRouter {operation} failed: provider returned an invalid response.") from exc
    return content


async def evaluate_turn(
    client: httpx.AsyncClient,
    settings: AppSettings,
    turn_id: int,
    transcript: list[TranscriptEntry],
    prompt: str,
    retries: int = 2,
) -> Feedback:
    user_data: dict[str, Any] = {
        "latestLearnerTurn": turn_id,
        "transcript": [
            {"role": "learner" if entry.role == "user" else "tutor", "message": entry.text} for entry in transcript
        ],
    }
    failure: ValidationError | None = None
    for _ in range(retries):
        content = await _completion(
            client,
            settings,
            model=required("OPENROUTER_UTILITY_MODEL", settings.openrouter_utility_model),
            prompt=prompt,
            user_data=user_data,
            schema_name="spanish_turn_feedback",
            schema_model=Feedback,
            max_tokens=900,
            operation="evaluation",
        )
        try:
            return Feedback.model_validate_json(content)
        except ValidationError as exc:
            failure = exc
            user_data["validationFeedback"] = "; ".join(error["msg"] for error in exc.errors())
    logger.warning("OpenRouter returned invalid evaluation data: %s", user_data["validationFeedback"])
    raise HTTPException(502, "OpenRouter evaluation failed: provider returned an invalid response.") from failure


async def translate_transcript(
    client: httpx.AsyncClient,
    settings: AppSettings,
    text: str,
    prompt: str,
    retries: int = 2,
) -> TranscriptTranslation:
    failure: Exception | None = None
    for _ in range(retries):
        content = await _completion(
            client,
            settings,
            model=required("OPENROUTER_UTILITY_MODEL", settings.openrouter_utility_model),
            prompt=prompt,
            user_data={"text": text},
            schema_name="avatar_transcript_translation",
            schema_model=TranscriptTranslation,
            max_tokens=400,
            operation="translation",
        )
        try:
            translation = TranscriptTranslation.model_validate_json(content)
            if translation.spanish_text() != text.strip():
                raise ValueError
            return translation
        except (ValidationError, ValueError) as exc:
            failure = exc
    logger.warning("OpenRouter returned invalid translation data")
    raise HTTPException(502, "OpenRouter translation failed: provider returned an invalid response.") from failure


async def suggest_response(
    client: httpx.AsyncClient,
    settings: AppSettings,
    scenario: Scenario,
    transcript: list[TranscriptEntry],
    previous_learner_scripts: list[str],
    prompt: str,
    retries: int = 2,
) -> SuggestedResponse:
    failure: Exception | None = None
    for _ in range(retries):
        content = await _completion(
            client,
            settings,
            model=required("OPENROUTER_GUIDED_MODEL", settings.openrouter_guided_model),
            prompt=prompt,
            user_data={
                "scenarioTitle": scenario.title,
                "learnerRole": scenario.learner_role,
                "learnerGoal": scenario.learner_goal,
                "learnerPriorities": list(scenario.guided_priorities),
                "previousLearnerScripts": previous_learner_scripts,
                "dialogue": [
                    {"role": "learner" if entry.role == "user" else "tutor", "message": entry.text}
                    for entry in transcript
                ],
            },
            schema_name="guided_suggested_response",
            schema_model=SuggestedResponse,
            max_tokens=400,
            operation="suggestion",
            reasoning=False,
        )
        try:
            return SuggestedResponse.model_validate_json(content)
        except ValidationError as exc:
            failure = exc
    logger.warning("OpenRouter returned invalid suggestion data")
    raise HTTPException(502, "OpenRouter suggestion failed: provider returned an invalid response.") from failure
