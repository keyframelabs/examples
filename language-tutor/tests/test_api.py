from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import main


class FakeProviderClient:
    calls: list[dict[str, Any]] = []
    responses: dict[str, tuple[int, dict[str, Any]]] = {}

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> FakeProviderClient:
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    async def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        provider = "keyframe" if "keyframelabs" in url else "elevenlabs" if "elevenlabs" in url else "openrouter"
        status, body = self.responses[provider]
        return httpx.Response(status, json=body, request=httpx.Request(method, url))


@pytest.fixture(autouse=True)
def configured_app(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in {
        "KEYFRAME_API_KEY": "keyframe-test",
        "ELEVENLABS_API_KEY": "eleven-test",
        "ELEVENLABS_AGENT_ID": "agent-test",
        "OPENROUTER_API_KEY": "openrouter-test",
    }.items():
        monkeypatch.setenv(name, value)
    main.SESSIONS.clear()
    FakeProviderClient.calls = []
    FakeProviderClient.responses = {
        "keyframe": (
            200,
            {
                "server_url": "wss://keyframe.test/session",
                "participant_token": "participant-token",
                "agent_identity": "agent-identity",
            },
        ),
        "elevenlabs": (200, {"signed_url": "wss://eleven.test/conversation"}),
        "openrouter": (
            200,
            {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"feedback":"Needs Improvement","inputEnglish":"I want coffee",'
                                '"suggestionSpanish":"Quiero un café.",'
                                '"suggestionEnglish":"I would like a coffee.",'
                                '"reason":"The article is required here."}'
                            )
                        }
                    }
                ]
            },
        ),
    }
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeProviderClient)
    yield
    main.SESSIONS.clear()


def test_complete_language_tutor_flow() -> None:
    with TestClient(main.app) as client:
        catalog = client.get("/api/scenarios")
        session = client.post("/api/sessions", json={"scenarioId": "market"})
        session_id = session.json()["sessionId"]
        turn = client.post(
            f"/api/sessions/{session_id}/turns",
            json={
                "turnId": 1,
                "turn": {"role": "user", "message": "Quiero café", "source": "microphone"},
                "transcript": [
                    {"role": "agent", "message": "¿Qué desea?", "time_in_call_secs": 0.1},
                    {"role": "user", "message": "Quiero café"},
                ],
            },
        )
        replay = client.post(
            f"/api/sessions/{session_id}/turns",
            json={"turnId": 1, "turn": {"role": "user", "text": "Quiero café"}, "transcript": []},
        )
        summary = client.post(
            f"/api/sessions/{session_id}/end",
            json={
                "transcript": [
                    {"role": "assistant", "text": "¿Qué desea?", "timing": []},
                    {"role": "user", "text": "Quiero café", "timing": []},
                ]
            },
        )

    assert catalog.status_code == session.status_code == turn.status_code == summary.status_code == 200
    assert len(catalog.json()["scenarios"]) == 3
    assert "prompt" not in catalog.text.lower()
    assert session.json()["sessionDetails"]["participant_token"] == "participant-token"
    assert "scenario_prompt" in session.json()["voiceAgentDetails"]["dynamic_variables"]
    assert turn.json() == replay.json()
    assert turn.json()["suggestionSpanish"] == "Quiero un café."
    assert summary.json()["transcript"] == [
        {"role": "assistant", "text": "¿Qué desea?"},
        {"role": "user", "text": "Quiero café"},
    ]
    openrouter = next(call for call in FakeProviderClient.calls if "openrouter" in call["url"])
    schema = openrouter["kwargs"]["json"]["response_format"]["json_schema"]
    assert schema["strict"] is True
    assert schema["schema"]["additionalProperties"] is False
    assert sum("openrouter" in call["url"] for call in FakeProviderClient.calls) == 1


def test_provider_failures_have_stable_api_errors() -> None:
    FakeProviderClient.responses["keyframe"] = (401, {"detail": "bad credential"})
    with TestClient(main.app) as client:
        failed_session = client.post("/api/sessions", json={"scenarioId": "cafe-order"})
        FakeProviderClient.responses["keyframe"] = (
            200,
            {
                "server_url": "wss://keyframe.test/session",
                "participant_token": "participant-token",
                "agent_identity": "agent-identity",
            },
        )
        session_id = client.post("/api/sessions", json={"scenarioId": "cafe-order"}).json()["sessionId"]
        FakeProviderClient.responses["openrouter"] = (200, {"choices": [{"message": {"content": "not-json"}}]})
        invalid_feedback = client.post(
            f"/api/sessions/{session_id}/turns",
            json={"turnId": 1, "turn": {"role": "user", "text": "Hola"}, "transcript": []},
        )
        skipped_turn = client.post(
            f"/api/sessions/{session_id}/turns",
            json={"turnId": 2, "turn": {"role": "user", "text": "Café"}, "transcript": []},
        )

    assert failed_session.status_code == invalid_feedback.status_code == 502
    assert skipped_turn.status_code == 409
    assert failed_session.json() == {"error": "Keyframe session creation failed: bad credential"}
    assert invalid_feedback.json() == {"error": "OpenRouter evaluation failed: provider returned invalid JSON."}
