from __future__ import annotations

import json
import sys
import urllib.error
from io import BytesIO
from email.message import Message
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

from app import main


class ProviderResponse:
    def __init__(self, status: int, body: bytes, reason: str = "OK") -> None:
        self.status = status
        self.reason = reason
        self.headers = Message()
        self.headers["Content-Type"] = "application/json"
        self._body = body

    def __enter__(self) -> ProviderResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def test_provider_json_sends_payload_and_returns_json(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: int) -> ProviderResponse:
        captured["method"] = request.get_method()
        captured["url"] = request.full_url
        captured["headers"] = {key.lower(): value for key, value in request.header_items()}
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return ProviderResponse(200, b'{"session":"created"}')

    monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)

    result = main.provider_json(
        "POST",
        "https://provider.test/sessions",
        {
            "Authorization": "Bearer token",
            "Content-Type": "application/json",
        },
        {"persona_slug": "public:test"},
        "Provider request failed",
    )

    assert result == {"session": "created"}
    assert captured == {
        "method": "POST",
        "url": "https://provider.test/sessions",
        "headers": {
            "authorization": "Bearer token",
            "content-type": "application/json",
        },
        "payload": {"persona_slug": "public:test"},
        "timeout": main.PROVIDER_REQUEST_TIMEOUT_SECONDS,
    }


def test_provider_json_returns_empty_dict_for_empty_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_urlopen(_request: Any, timeout: int) -> ProviderResponse:
        assert timeout == main.PROVIDER_REQUEST_TIMEOUT_SECONDS
        return ProviderResponse(204, b"", "No Content")

    monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)

    assert main.provider_json(
        "GET",
        "https://provider.test/empty",
        {},
        None,
        "Provider request failed",
    ) == {}


def test_provider_json_preserves_provider_error_status_and_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_urlopen(_request: Any, timeout: int) -> ProviderResponse:
        assert timeout == main.PROVIDER_REQUEST_TIMEOUT_SECONDS
        headers = Message()
        headers["Content-Type"] = "application/json"
        raise urllib.error.HTTPError(
            "https://provider.test/error",
            429,
            "Too Many Requests",
            headers,
            BytesIO(b'{"detail":"rate limited"}'),
        )

    monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(HTTPException) as exc_info:
        main.provider_json(
            "GET",
            "https://provider.test/error",
            {},
            None,
            "Provider request failed",
        )

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "Provider request failed: rate limited"
