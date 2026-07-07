from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import HTTPException

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

from app import main


def test_provider_json_sends_payload_and_returns_json(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_request(
        _client: httpx.AsyncClient,
        method: str,
        url: str | httpx.URL,
        **kwargs: Any,
    ) -> httpx.Response:
        captured["method"] = method
        captured["url"] = str(url)
        captured["headers"] = kwargs["headers"]
        captured["payload"] = kwargs["json"]
        captured["timeout"] = kwargs["timeout"]
        captured["params"] = kwargs["params"]
        return httpx.Response(
            200,
            content=b'{"session":"created"}',
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(main.httpx.AsyncClient, "request", fake_request)

    result = asyncio.run(
        main.provider_json(
            "POST",
            "https://provider.test/sessions",
            {"Authorization": "Bearer token"},
            {"persona_slug": "public:test"},
            "Provider request failed",
        )
    )

    assert result == {"session": "created"}
    assert captured == {
        "method": "POST",
        "url": "https://provider.test/sessions",
        "headers": {"Authorization": "Bearer token"},
        "payload": {"persona_slug": "public:test"},
        "timeout": main.PROVIDER_REQUEST_TIMEOUT_SECONDS,
        "params": None,
    }


def test_provider_json_returns_empty_dict_for_empty_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_request(
        _client: httpx.AsyncClient,
        method: str,
        url: str | httpx.URL,
        **kwargs: Any,
    ) -> httpx.Response:
        assert kwargs["timeout"] == main.PROVIDER_REQUEST_TIMEOUT_SECONDS
        return httpx.Response(
            204,
            content=b"",
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(main.httpx.AsyncClient, "request", fake_request)

    assert (
        asyncio.run(
            main.provider_json(
                "GET",
                "https://provider.test/empty",
                {},
                None,
                "Provider request failed",
            )
        )
        == {}
    )


def test_provider_json_preserves_provider_error_status_and_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_request(
        _client: httpx.AsyncClient,
        method: str,
        url: str | httpx.URL,
        **_kwargs: Any,
    ) -> httpx.Response:
        return httpx.Response(
            429,
            content=b'{"detail":"rate limited"}',
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(main.httpx.AsyncClient, "request", fake_request)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.provider_json(
                "GET",
                "https://provider.test/error",
                {},
                None,
                "Provider request failed",
            )
        )

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "Provider request failed: rate limited"


def test_provider_json_maps_timeout_to_gateway_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_request(
        _client: httpx.AsyncClient,
        method: str,
        url: str | httpx.URL,
        **_kwargs: Any,
    ) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=httpx.Request(method, url))

    monkeypatch.setattr(main.httpx.AsyncClient, "request", fake_request)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.provider_json(
                "GET",
                "https://provider.test/slow",
                {},
                None,
                "Provider request failed",
            )
        )

    assert exc_info.value.status_code == 504
    assert exc_info.value.detail == "Provider request failed: provider request timed out."


def test_provider_json_maps_request_error_to_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_request(
        _client: httpx.AsyncClient,
        method: str,
        url: str | httpx.URL,
        **_kwargs: Any,
    ) -> httpx.Response:
        raise httpx.ConnectError("network down", request=httpx.Request(method, url))

    monkeypatch.setattr(main.httpx.AsyncClient, "request", fake_request)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.provider_json(
                "GET",
                "https://provider.test/unreachable",
                {},
                None,
                "Provider request failed",
            )
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Provider request failed: network down"


def test_signed_url_request_passes_query_params(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_provider_json(
        method: str,
        url: str | httpx.URL,
        headers: dict[str, str],
        payload: dict[str, Any] | None,
        error_prefix: str,
        *,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        captured["method"] = method
        captured["url"] = str(url)
        captured["headers"] = headers
        captured["payload"] = payload
        captured["error_prefix"] = error_prefix
        captured["params"] = params
        return {
            "signed_url": "wss://provider.test/signed",
            "conversation_id": "conversation-123",
        }

    monkeypatch.setenv("ELEVENLABS_API_BASE_URL", "https://api.elevenlabs.test")
    monkeypatch.setattr(main, "provider_json", fake_provider_json)

    result = asyncio.run(main.get_elevenlabs_signed_url("eleven-key", "agent-123"))

    assert result == {
        "signed_url": "wss://provider.test/signed",
        "conversation_id": "conversation-123",
    }
    assert captured == {
        "method": "GET",
        "url": "https://api.elevenlabs.test/v1/convai/conversation/get-signed-url",
        "headers": {"xi-api-key": "eleven-key"},
        "payload": None,
        "error_prefix": "ElevenLabs signed URL request failed",
        "params": {
            "agent_id": "agent-123",
            "include_conversation_id": "true",
        },
    }
