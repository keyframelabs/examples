import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.interviews.interview_loader import (
    InterviewPrompt,
    InterviewPromptMetadata,
    InterviewPromptValidationError,
    load_interview_prompts,
)


class FakeProviders:
    """Records every provider request and serves canned success responses."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "api.keyframelabs.com":
            return httpx.Response(
                200,
                json={
                    "server_url": "wss://keyframe.example/live",
                    "participant_token": "participant-token",
                    "agent_identity": "avatar-agent",
                    "region": "us-east-1",
                },
            )
        return httpx.Response(200, json={"signed_url": "wss://elevenlabs.example/conversation"})


@pytest.fixture(autouse=True)
def isolate_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(main, "ENV_FILES", None)
    for name in (
        "KEYFRAME_API_KEY",
        "KEYFRAME_PERSONA_SLUG",
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_AGENT_ID",
        "ELEVENLABS_API_BASE_URL",
        "CLIENT_ORIGIN",
        "PROVIDER_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)
    main.get_settings.cache_clear()
    yield
    main.get_settings.cache_clear()


@pytest.fixture
def fake_providers(monkeypatch: pytest.MonkeyPatch) -> FakeProviders:
    """Route the lifespan-created provider client through a recording MockTransport."""
    fake = FakeProviders()
    real_async_client = httpx.AsyncClient

    def client_with_fake_transport(**kwargs: Any) -> httpx.AsyncClient:
        return real_async_client(transport=httpx.MockTransport(fake.handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_with_fake_transport)
    return fake


@pytest.fixture
def provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()


def make_prompt(prompt_id: str, title: str, skill_level: str) -> InterviewPrompt:
    return InterviewPrompt(
        prompt_id=prompt_id,
        metadata=InterviewPromptMetadata(display_name=title, skill_level=skill_level),
        prompt=f"# {title}\n",
    )


def test_cors_allows_configured_dev_origin() -> None:
    with TestClient(main.app) as client:
        response = client.options(
            "/api/session",
            headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "POST"},
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5174"


def test_catalog_lists_public_fields_ordered_by_skill_then_title(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts = [
        make_prompt("beta-store", "beta store", "Senior"),
        make_prompt("apple-queue", "Apple queue", "Senior"),
        make_prompt(main.DEFAULT_INTERVIEW_PROMPT_ID, "TinyURL", "Junior"),
        make_prompt("zebra-cache", "zebra cache", "Intern"),
    ]
    monkeypatch.setattr(main, "load_interview_prompts", lambda: {prompt.prompt_id: prompt for prompt in prompts})

    with TestClient(main.app) as client:
        response = client.get("/api/interviews")

    assert response.status_code == 200
    assert response.json() == {
        "interviews": [
            {"packetId": "zebra-cache", "title": "zebra cache", "skillLevel": "Intern"},
            {"packetId": main.DEFAULT_INTERVIEW_PROMPT_ID, "title": "TinyURL", "skillLevel": "Junior"},
            {"packetId": "apple-queue", "title": "Apple queue", "skillLevel": "Senior"},
            {"packetId": "beta-store", "title": "beta store", "skillLevel": "Senior"},
        ]
    }


def test_create_session_rejects_unknown_packet_before_settings_and_providers(fake_providers: FakeProviders) -> None:
    # No provider settings are configured, so a 404 (not a 400) proves the packet
    # check runs before settings validation.
    with TestClient(main.app) as client:
        response = client.post("/api/session", json={"packetId": "not-a-packet"})

    assert response.status_code == 404
    assert response.json() == {"error": "Unknown interview packet: not-a-packet"}
    assert fake_providers.requests == []


def test_startup_snapshots_prompts_once_and_fails_on_invalid(
    monkeypatch: pytest.MonkeyPatch, fake_providers: FakeProviders
) -> None:
    load_calls = 0

    def load_prompts_once() -> dict[str, InterviewPrompt]:
        nonlocal load_calls
        load_calls += 1
        prompt = make_prompt(main.DEFAULT_INTERVIEW_PROMPT_ID, "TinyURL snapshot", "Junior")
        return {prompt.prompt_id: prompt}

    monkeypatch.setattr(main, "load_interview_prompts", load_prompts_once)

    with TestClient(main.app) as client:
        first = client.get("/api/interviews")
        second = client.get("/api/interviews")
        unknown = client.post("/api/session", json={"packetId": "added-after-startup"})

    assert first.status_code == 200
    assert first.json()["interviews"][0]["title"] == "TinyURL snapshot"
    assert second.json() == first.json()
    assert unknown.status_code == 404
    assert load_calls == 1
    assert fake_providers.requests == []

    def fail_validation() -> dict[str, InterviewPrompt]:
        raise InterviewPromptValidationError("Interview prompt validation failed:\n- bad.md: missing metadata")

    monkeypatch.setattr(main, "load_interview_prompts", fail_validation)

    with pytest.raises(InterviewPromptValidationError, match="bad.md"):
        with TestClient(main.app):
            pass


def test_create_session_returns_packet_prompt_and_calls_both_providers(
    fake_providers: FakeProviders, provider_env: None
) -> None:
    real_prompts = load_interview_prompts()

    with TestClient(main.app) as client:
        default_response = client.post("/api/session")
        selected_response = client.post("/api/session", json={"packetId": "pastebin-system-design"})

    assert default_response.status_code == 200
    assert default_response.json() == {
        "sessionDetails": {
            "server_url": "wss://keyframe.example/live",
            "participant_token": "participant-token",
            "agent_identity": "avatar-agent",
            "region": "us-east-1",
        },
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": "agent_123",
            "signed_url": "wss://elevenlabs.example/conversation",
            "dynamic_variables": {
                "interview_packet": real_prompts[main.DEFAULT_INTERVIEW_PROMPT_ID].prompt.strip(),
            },
        },
    }

    assert selected_response.status_code == 200
    assert selected_response.json()["voiceAgentDetails"]["dynamic_variables"] == {
        "interview_packet": real_prompts["pastebin-system-design"].prompt.strip(),
    }

    keyframe_request = next(r for r in fake_providers.requests if r.url.host == "api.keyframelabs.com")
    assert keyframe_request.method == "POST"
    assert keyframe_request.url == httpx.URL("https://api.keyframelabs.com/v1/sessions")
    assert keyframe_request.headers["Authorization"] == "Bearer keyframe-key"
    assert json.loads(keyframe_request.content) == {"persona_slug": "public:lyra_persona-1.5-live"}

    elevenlabs_request = next(r for r in fake_providers.requests if r.url.host == "api.elevenlabs.io")
    assert elevenlabs_request.method == "GET"
    assert elevenlabs_request.url == httpx.URL(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        params={"agent_id": "agent_123"},
    )
    assert elevenlabs_request.headers["xi-api-key"] == "eleven-key"


@pytest.mark.parametrize(
    ("preset_env", "missing_name"),
    [
        ({}, "KEYFRAME_API_KEY"),
        ({"KEYFRAME_API_KEY": "keyframe-key"}, "ELEVENLABS_API_KEY"),
        ({"KEYFRAME_API_KEY": "keyframe-key", "ELEVENLABS_API_KEY": "eleven-key"}, "ELEVENLABS_AGENT_ID"),
    ],
)
def test_create_session_reports_first_missing_setting(
    monkeypatch: pytest.MonkeyPatch, preset_env: dict[str, str], missing_name: str
) -> None:
    for name, value in preset_env.items():
        monkeypatch.setenv(name, value)
    main.get_settings.cache_clear()

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": f"Missing {missing_name}. Add it to .env and restart pnpm dev."}


def test_prompt_validation_requires_default_packet_file(tmp_path: Path) -> None:
    (tmp_path / "other-interview.md").write_text(
        "---\ndisplay_name: Other\nskill_level: Junior\n---\n\n# Prompt body\n",
        encoding="utf-8",
    )

    with pytest.raises(InterviewPromptValidationError, match=main.DEFAULT_INTERVIEW_PROMPT_ID):
        load_interview_prompts(tmp_path)
