from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.interviews.interview_loader import InterviewPrompt, InterviewPromptValidationError

REAL_SYNC_ELEVENLABS_AGENT = main.sync_elevenlabs_agent


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
        "ELEVENLABS_API_BASE_URL",
        "CLIENT_ORIGIN",
        "PROVIDER_TIMEOUT_SECONDS",
    ]:
        monkeypatch.delenv(name, raising=False)

    async def skip_startup_sync(*_args: Any, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(main, "sync_elevenlabs_agent", skip_startup_sync)
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


def test_backend_startup_validates_all_prompts_and_synchronizes_only_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    monkeypatch.setattr(main, "sync_elevenlabs_agent", REAL_SYNC_ELEVENLABS_AGENT)
    main.get_settings.cache_clear()

    default_prompt = InterviewPrompt(
        prompt_id=main.DEFAULT_INTERVIEW_PROMPT_ID,
        display_name="TinyURL",
        prompt="# TinyURL prompt\n",
        source_path=Path("tinyurl.md"),
    )
    future_prompt = InterviewPrompt(
        prompt_id="future-interview",
        display_name="Future",
        prompt="# Future prompt\n",
        source_path=Path("future.md"),
    )
    load_calls = 0

    def load_prompts() -> dict[str, InterviewPrompt]:
        nonlocal load_calls
        load_calls += 1
        return {
            default_prompt.prompt_id: default_prompt,
            future_prompt.prompt_id: future_prompt,
        }

    monkeypatch.setattr(main, "load_interview_prompts", load_prompts)

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
    assert load_calls == 1
    assert RecordingStartupClient.requests == [
        {
            "method": "PATCH",
            "url": "https://api.elevenlabs.io/v1/convai/agents/agent_123",
            "kwargs": {
                "headers": {
                    "Content-Type": "application/json",
                    "xi-api-key": "eleven-key",
                },
                "json": main.build_elevenlabs_agent_update_payload(default_prompt),
            },
        }
    ]


def test_backend_startup_stops_on_prompt_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_validation() -> dict[str, InterviewPrompt]:
        raise InterviewPromptValidationError("Interview prompt validation failed:\n- bad.md: missing id")

    monkeypatch.setattr(main, "load_interview_prompts", fail_validation)

    with pytest.raises(InterviewPromptValidationError, match="bad.md: missing id"):
        with TestClient(main.app):
            pass


def test_backend_startup_fails_when_elevenlabs_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    monkeypatch.setattr(main, "sync_elevenlabs_agent", REAL_SYNC_ELEVENLABS_AGENT)
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


def test_create_session_endpoint_uses_shared_elevenlabs_agent(
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


def test_create_session_reports_missing_shared_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    main.get_settings.cache_clear()

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing ELEVENLABS_AGENT_ID. Add it to .env and restart pnpm dev."}


def test_deliberate_agent_update_includes_prompt_and_shared_settings() -> None:
    requests: list[dict[str, Any]] = []

    class RecordingClient:
        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            requests.append({"method": method, "url": url, "kwargs": kwargs})
            return StubResponse(body={})

    prompt = main.get_interview_prompt()
    settings = main.Settings(_env_file=None)
    asyncio.run(
        main.update_elevenlabs_agent(
            RecordingClient(),
            "eleven-key",
            "agent_123",
            prompt,
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
                "json": main.build_elevenlabs_agent_update_payload(prompt),
            },
        }
    ]


def test_create_session_endpoint_reports_missing_required_settings() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing KEYFRAME_API_KEY. Add it to .env and restart pnpm dev."}
