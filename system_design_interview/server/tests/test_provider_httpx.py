from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main


class StubResponse:
    def __init__(self, *, body: dict[str, Any]) -> None:
        self.status_code = 200
        self.reason_phrase = "OK"
        self.content = b"json"
        self._body = body

    def json(self) -> dict[str, Any]:
        return self._body


@pytest.fixture(autouse=True)
def isolate_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "ENV_FILES", None)
    for name in [
        "KEYFRAME_API_KEY",
        "KEYFRAME_PERSONA_SLUG",
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_AGENT_ID",
        "ELEVENLABS_API_BASE_URL",
        "CLIENT_ORIGIN",
        "PROVIDER_TIMEOUT_SECONDS",
    ]:
        monkeypatch.delenv(name, raising=False)
    main.get_settings.cache_clear()
    yield
    main.get_settings.cache_clear()


def test_cors_allows_localhost_dev_origin() -> None:
    with TestClient(main.app) as client:
        localhost_response = client.options(
            "/api/session",
            headers={
                "Origin": "http://localhost:5174",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert localhost_response.status_code == 200
    assert localhost_response.headers["access-control-allow-origin"] == "http://localhost:5174"


def test_create_session_endpoint_uses_keyframe_and_elevenlabs_provider_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()

    class RecordingLifecycleClient:
        requests: list[dict[str, Any]] = []

        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "RecordingLifecycleClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            return None

        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            self.requests.append({"method": method, "url": url, "kwargs": kwargs})
            if method == "PATCH":
                raise AssertionError("session creation must not update persistent ElevenLabs agent settings")
            if "keyframelabs" in url:
                return StubResponse(
                    body={
                        "server_url": "wss://keyframe.example/live",
                        "participant_token": "participant-token",
                        "agent_identity": "avatar-agent",
                    }
                )
            return StubResponse(
                body={
                    "signed_url": "wss://elevenlabs.example/conversation",
                    "conversation_id": "conversation_123",
                }
            )

    monkeypatch.setattr(main.httpx, "AsyncClient", RecordingLifecycleClient)

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 200
    assert response.json() == {
        "sessionDetails": {
            "server_url": "wss://keyframe.example/live",
            "participant_token": "participant-token",
            "agent_identity": "avatar-agent",
        },
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": "agent_123",
            "signed_url": "wss://elevenlabs.example/conversation",
            "dynamic_variables": {
                "interviewer_name": "Lyra",
                "interview_type": "system design",
                "canvas_context_format": "Serialized canvas architecture text",
            },
        },
        "conversationId": "conversation_123",
    }

    keyframe_request = next(
        request for request in RecordingLifecycleClient.requests if "keyframelabs" in request["url"]
    )
    assert keyframe_request == {
        "method": "POST",
        "url": "https://api.keyframelabs.com/v1/sessions",
        "kwargs": {
            "headers": {
                "Authorization": "Bearer keyframe-key",
                "Content-Type": "application/json",
            },
            "json": {"persona_slug": "public:lyra_persona-1.5-live"},
        },
    }

    elevenlabs_request = next(
        request for request in RecordingLifecycleClient.requests if "elevenlabs" in request["url"]
    )
    assert elevenlabs_request == {
        "method": "GET",
        "url": "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        "kwargs": {
            "headers": {"xi-api-key": "eleven-key"},
            "params": {
                "agent_id": "agent_123",
                "include_conversation_id": "true",
            },
        },
    }


def test_create_session_endpoint_reports_missing_required_settings() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing KEYFRAME_API_KEY. Add it to .env and restart pnpm dev."}
