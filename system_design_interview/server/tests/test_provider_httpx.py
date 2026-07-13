from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main

REAL_SYNC_ELEVENLABS_AGENTS = main.sync_elevenlabs_agents


class StubResponse:
    def __init__(
        self,
        *,
        body: dict[str, Any],
        status_code: int = 200,
        reason_phrase: str = "OK",
    ) -> None:
        self.status_code = status_code
        self.reason_phrase = reason_phrase
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
        "ELEVENLABS_AGENT_IDS",
        "ELEVENLABS_API_BASE_URL",
        "CLIENT_ORIGIN",
        "PROVIDER_TIMEOUT_SECONDS",
    ]:
        monkeypatch.delenv(name, raising=False)

    async def skip_startup_sync(*_args: Any, **_kwargs: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(main, "sync_elevenlabs_agents", skip_startup_sync)
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


def test_backend_startup_synchronizes_registered_elevenlabs_agents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_IDS", '{"tinyurl-system-design":"agent_123"}')
    monkeypatch.setattr(main, "sync_elevenlabs_agents", REAL_SYNC_ELEVENLABS_AGENTS)
    main.get_settings.cache_clear()

    class RecordingStartupClient:
        requests: list[dict[str, Any]] = []

        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "RecordingStartupClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            return None

        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            self.requests.append({"method": method, "url": url, "kwargs": kwargs})
            return StubResponse(body={})

    monkeypatch.setattr(main.httpx, "AsyncClient", RecordingStartupClient)

    with TestClient(main.app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert RecordingStartupClient.requests == [
        {
            "method": "PATCH",
            "url": "https://api.elevenlabs.io/v1/convai/agents/agent_123",
            "kwargs": {
                "headers": {
                    "Content-Type": "application/json",
                    "xi-api-key": "eleven-key",
                },
                "json": main.build_elevenlabs_agent_update_payload(),
            },
        }
    ]


def test_backend_startup_fails_when_elevenlabs_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_IDS", '{"tinyurl-system-design":"agent_123"}')
    monkeypatch.setattr(main, "sync_elevenlabs_agents", REAL_SYNC_ELEVENLABS_AGENTS)
    main.get_settings.cache_clear()

    class FailingStartupClient:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "FailingStartupClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            return None

        async def request(self, _method: str, _url: str, **_kwargs: Any) -> StubResponse:
            return StubResponse(
                body={"detail": "agent update rejected"},
                status_code=500,
                reason_phrase="Internal Server Error",
            )

    monkeypatch.setattr(main.httpx, "AsyncClient", FailingStartupClient)

    with pytest.raises(
        RuntimeError,
        match="ElevenLabs startup sync failed: ElevenLabs agent update failed: agent update rejected",
    ):
        with TestClient(main.app):
            pass


def test_create_session_endpoint_uses_keyframe_and_elevenlabs_provider_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_IDS", '{"tinyurl-system-design":"agent_123"}')
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
                raise AssertionError("session creation must not update persistent ElevenLabs agent configuration")
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
        request
        for request in RecordingLifecycleClient.requests
        if request["method"] == "GET" and "elevenlabs" in request["url"]
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

    assert all(request["method"] != "PATCH" for request in RecordingLifecycleClient.requests)


def test_create_session_rejects_unknown_packet_before_provider_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_IDS", '{"tinyurl-system-design":"agent_123"}')
    main.get_settings.cache_clear()

    class NoProviderRequestClient:
        requests: list[dict[str, Any]] = []

        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "NoProviderRequestClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            return None

        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            self.requests.append({"method": method, "url": url, "kwargs": kwargs})
            raise AssertionError("unknown packets must be rejected before provider requests")

    monkeypatch.setattr(main.httpx, "AsyncClient", NoProviderRequestClient)

    with TestClient(main.app) as client:
        response = client.post("/api/session", json={"packetId": "unknown-system-design"})

    assert response.status_code == 404
    assert response.json() == {"error": "Unknown interview packet: unknown-system-design"}
    assert NoProviderRequestClient.requests == []


def test_create_session_reports_missing_packet_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    main.get_settings.cache_clear()

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {
        "error": (
            "Missing ElevenLabs agent ID for interview packet 'tinyurl-system-design'. "
            "Add it to ELEVENLABS_AGENT_IDS in .env and restart pnpm dev."
        )
    }


def test_deliberate_agent_update_includes_prompt_and_turn_settings() -> None:
    requests: list[dict[str, Any]] = []

    class RecordingClient:
        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            requests.append({"method": method, "url": url, "kwargs": kwargs})
            return StubResponse(body={})

    settings = main.Settings(_env_file=None)
    asyncio.run(
        main.update_elevenlabs_agent(
            RecordingClient(),
            "eleven-key",
            "agent_123",
            main.get_interview_packet(),
            settings,
        )
    )

    assert requests == [
        {
            "method": "PATCH",
            "url": "https://api.elevenlabs.io/v1/convai/agents/agent_123",
            "kwargs": {
                "headers": {
                    "Content-Type": "application/json",
                    "xi-api-key": "eleven-key",
                },
                "json": main.build_elevenlabs_agent_update_payload(),
            },
        }
    ]


def test_create_session_endpoint_reports_missing_required_settings() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing KEYFRAME_API_KEY. Add it to .env and restart pnpm dev."}
