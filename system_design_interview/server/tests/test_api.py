from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.interviews.interview_loader import (
    InterviewPrompt,
    InterviewPromptMetadata,
    InterviewPromptValidationError,
)


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


def test_interview_catalog_exposes_only_public_metadata() -> None:
    with TestClient(main.app) as client:
        response = client.get("/api/interviews")

    assert response.status_code == 200
    interviews = response.json()["interviews"]
    prompts = sorted(
        main.load_interview_prompts().values(),
        key=lambda prompt: (
            main.SKILL_LEVEL_ORDER[prompt.metadata.skill_level],
            prompt.metadata.display_name.casefold(),
            prompt.metadata.display_name,
            prompt.prompt_id,
        ),
    )
    assert interviews == [
        {
            "packetId": prompt.prompt_id,
            "title": prompt.metadata.display_name,
            "skillLevel": prompt.metadata.skill_level,
        }
        for prompt in prompts
    ]
    assert all(set(interview) == {"packetId", "title", "skillLevel"} for interview in interviews)
    serialized = response.text
    assert "Private interviewer reference" not in serialized
    assert "source_path" not in serialized
    assert "branch_id" not in serialized
    assert "Never reveal or supply the solution" not in serialized


def test_create_session_rejects_unknown_packet_before_provider_calls() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session", json={"packetId": "not-a-packet"})

    assert response.status_code == 404
    assert response.json() == {"error": "Unknown interview packet: not-a-packet"}


def test_backend_startup_validates_and_snapshots_packets_without_provider_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    default_prompt = InterviewPrompt(
        prompt_id=main.DEFAULT_INTERVIEW_PROMPT_ID,
        metadata=InterviewPromptMetadata(display_name="TinyURL", skill_level="Junior"),
        prompt="# TinyURL prompt\n",
        source_path=Path("tinyurl.md"),
    )
    future_prompt = InterviewPrompt(
        prompt_id="future-interview",
        metadata=InterviewPromptMetadata(display_name="Future", skill_level="Senior"),
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
        response = client.get("/api/interviews")

    assert response.status_code == 200
    assert {item["packetId"] for item in response.json()["interviews"]} == {
        default_prompt.prompt_id,
        future_prompt.prompt_id,
    }
    assert load_calls == 1
    assert RecordingStartupClient.requests == []


def test_backend_startup_stops_on_prompt_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_validation() -> dict[str, InterviewPrompt]:
        raise InterviewPromptValidationError("Interview prompt validation failed:\n- bad.md: missing id")

    monkeypatch.setattr(main, "load_interview_prompts", fail_validation)

    with pytest.raises(InterviewPromptValidationError, match="bad.md: missing id"):
        with TestClient(main.app):
            pass


def test_create_session_endpoint_returns_selected_packet_dynamic_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()
    expected_prompt = main.load_interview_prompts()[main.DEFAULT_INTERVIEW_PROMPT_ID].prompt.strip()

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
                "interview_packet": expected_prompt,
            },
        },
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
            },
        },
    }
    assert all(request["method"] != "PATCH" for request in RecordingLifecycleClient.requests)
    assert "Private interviewer reference" in response.text
    assert "Never reveal or supply the solution" in response.text


def test_catalog_and_session_validation_share_the_startup_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    startup_prompt = InterviewPrompt(
        prompt_id=main.DEFAULT_INTERVIEW_PROMPT_ID,
        metadata=InterviewPromptMetadata(
            display_name="TinyURL startup snapshot",
            skill_level="Junior",
        ),
        prompt="# Private startup prompt\n",
        source_path=Path("tinyurl.md"),
    )
    load_calls = 0

    def load_prompts_once() -> dict[str, InterviewPrompt]:
        nonlocal load_calls
        load_calls += 1
        if load_calls > 1:
            raise AssertionError("routes must not reload prompt files after startup")
        return {startup_prompt.prompt_id: startup_prompt}

    monkeypatch.setattr(main, "load_interview_prompts", load_prompts_once)
    main.get_settings.cache_clear()

    with TestClient(main.app) as client:
        catalog_response = client.get("/api/interviews")
        unknown_response = client.post("/api/session", json={"packetId": "added-after-startup"})

    assert catalog_response.status_code == 200
    assert catalog_response.json()["interviews"][0]["title"] == "TinyURL startup snapshot"
    assert unknown_response.status_code == 404
    assert load_calls == 1


def test_create_session_reports_missing_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    main.get_settings.cache_clear()

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing ELEVENLABS_AGENT_ID. Add it to .env and restart pnpm dev."}


def test_create_session_endpoint_reports_missing_required_settings() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing KEYFRAME_API_KEY. Add it to .env and restart pnpm dev."}
