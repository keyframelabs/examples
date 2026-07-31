from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any, Protocol, TypeVar

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from .schemas import ElevenLabsSignedUrlResponse, KeyframeSessionDetails
from .settings import Settings, load_settings

INTERVIEW_PACKET_DYNAMIC_VARIABLE = "interview_packet"

ModelT = TypeVar("ModelT", bound=BaseModel)
ProviderJson = Callable[..., Awaitable[dict[str, Any]]]
ProviderResponseParser = Callable[[httpx.Response], Any]
ProviderErrorExtractor = Callable[[Any, str], str]


class ModelValidator(Protocol):
    def __call__(
        self,
        model_type: type[ModelT],
        body: dict[str, Any],
        error_prefix: str,
    ) -> ModelT: ...


async def create_keyframe_session(
    client: httpx.AsyncClient,
    api_key: str,
    settings: Settings | None = None,
    *,
    request_json: ProviderJson,
    model_validator: ModelValidator,
) -> KeyframeSessionDetails:
    settings = settings or load_settings()
    body = await request_json(
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

    return model_validator(KeyframeSessionDetails, body, "Keyframe session creation failed")


async def get_elevenlabs_signed_url(
    client: httpx.AsyncClient,
    api_key: str,
    agent_id: str,
    settings: Settings | None = None,
    *,
    request_json: ProviderJson,
    model_validator: ModelValidator,
) -> ElevenLabsSignedUrlResponse:
    settings = settings or load_settings()
    body = await request_json(
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

    return model_validator(ElevenLabsSignedUrlResponse, body, "ElevenLabs signed URL request failed")


async def provider_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None,
    error_prefix: str,
    params: dict[str, str] | None = None,
    *,
    response_parser: ProviderResponseParser,
    error_extractor: ProviderErrorExtractor,
) -> dict[str, Any]:
    request_kwargs: dict[str, Any] = {"headers": headers}
    if params is not None:
        request_kwargs["params"] = params
    if payload is not None:
        request_kwargs["json"] = payload

    try:
        response = await client.request(method, url, **request_kwargs)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{error_prefix}: provider request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"{error_prefix}: {exc}") from exc

    body = response_parser(response)
    if not 200 <= response.status_code < 300:
        detail = error_extractor(body, response.reason_phrase or "provider error")
        raise HTTPException(status_code=response.status_code, detail=f"{error_prefix}: {detail}")

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
