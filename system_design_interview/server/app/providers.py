from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from .schemas import ElevenLabsSignedUrlResponse, KeyframeSessionDetails
from .settings import Settings

INTERVIEW_PACKET_DYNAMIC_VARIABLE = "interview_packet"


async def create_keyframe_session(
    client: httpx.AsyncClient,
    api_key: str,
    settings: Settings,
) -> KeyframeSessionDetails:
    return await _provider_request(
        client,
        KeyframeSessionDetails,
        "Keyframe session creation failed",
        "POST",
        "https://api.keyframelabs.com/v1/sessions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"persona_slug": settings.keyframe_persona_slug},
    )


async def get_elevenlabs_signed_url(
    client: httpx.AsyncClient,
    api_key: str,
    agent_id: str,
    settings: Settings,
) -> ElevenLabsSignedUrlResponse:
    return await _provider_request(
        client,
        ElevenLabsSignedUrlResponse,
        "ElevenLabs signed URL request failed",
        "GET",
        f"{settings.elevenlabs_api_base_url}/v1/convai/conversation/get-signed-url",
        headers={"xi-api-key": api_key},
        params={"agent_id": agent_id},
    )


async def _provider_request[ModelT: BaseModel](
    client: httpx.AsyncClient,
    response_model: type[ModelT],
    error_prefix: str,
    method: str,
    url: str,
    **request_kwargs: Any,
) -> ModelT:
    try:
        response = await client.request(method, url, **request_kwargs)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{error_prefix}: provider request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"{error_prefix}: {exc}") from exc

    if not response.is_success:
        raise HTTPException(status_code=response.status_code, detail=f"{error_prefix}: {_error_detail(response)}")

    try:
        return response_model.model_validate(response.json() if response.content else {})
    except (ValueError, ValidationError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{error_prefix}: provider returned an invalid response body.",
        ) from exc


def _error_detail(response: httpx.Response) -> str:
    try:
        body: Any = response.json()
    except ValueError:
        body = response.text

    if isinstance(body, dict):
        detail = body.get("detail") or body.get("message") or body.get("error")
        if isinstance(detail, str):
            return detail
    if isinstance(body, str) and body:
        return body
    return response.reason_phrase or "provider error"
