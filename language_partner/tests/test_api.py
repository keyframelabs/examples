from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.main import create_app
from backend.models import AppSettings, Feedback
from backend.providers import UNSUPPORTED_STRICT_SCHEMA_KEYS

SETTINGS = AppSettings(
    keyframe_api_key="keyframe-test",
    keyframe_persona_slug="persona-test",
    elevenlabs_api_key="eleven-test",
    elevenlabs_agent_id="agent-test",
    openrouter_api_key="openrouter-test",
    openrouter_guided_model="guided-model-test",
    openrouter_utility_model="utility-model-test",
)
FEEDBACK = {
    "feedback": "Great Job!",
    "suggestionSpanish": None,
    "suggestionEnglish": None,
    "reason": "",
}
TRANSLATION = {
    "translation": "Would you like anything?",
    "segments": [
        {"spanish": "¿Quiere", "english": "Would you like"},
        {"spanish": "algo?", "english": "anything?"},
    ],
}
SUGGESTION = {
    "response": "Quiero agua, por favor.",
    "translation": "I want water, please.",
    "segments": [
        {"spanish": "Quiero", "english": "I want"},
        {"spanish": "agua,", "english": "water,"},
        {"spanish": "por favor.", "english": "please."},
    ],
    "conversationMove": "answer",
    "followUpMove": None,
}


def nested_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(nested_keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(nested_keys(item) for item in value))
    return set()


def transport(
    calls: list[httpx.Request], invalid: str | None = None, invalid_once: bool = False
) -> httpx.MockTransport:
    async def provider(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.host == "api.keyframelabs.com":
            if invalid == "provider":
                return httpx.Response(500, json={"secret": "hidden"}, request=request)
            body: Any = {
                "server_url": "wss://keyframe.test/session",
                "participant_token": "participant-token",
                "agent_identity": "agent-identity",
            }
        elif request.url.host == "api.elevenlabs.io":
            body = {"signed_url": "wss://eleven.test/conversation"}
        elif request.url.host == "openrouter.ai":
            response_format = json.loads(request.content)["response_format"]["json_schema"]
            assert not UNSUPPORTED_STRICT_SCHEMA_KEYS.intersection(nested_keys(response_format["schema"]))
            schema = response_format["name"]
            values = {
                "spanish_turn_feedback": FEEDBACK,
                "avatar_transcript_translation": TRANSLATION,
                "guided_suggested_response": SUGGESTION,
            }
            value = values[schema]
            if invalid == schema and (
                not invalid_once or not any(call.url.host == "openrouter.ai" for call in calls[:-1])
            ):
                value = {**value, next(iter(value)): None}
            body = {
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": json.dumps(value)}}]
            }
        else:
            raise AssertionError(f"Unexpected provider: {request.url.host}")
        return httpx.Response(200, json=body, request=request)

    return httpx.MockTransport(provider)


def test_complete_mocked_session_flow() -> None:
    calls: list[httpx.Request] = []
    transcript = [
        {"role": "assistant", "text": "¿Qué desea?"},
        {"role": "user", "text": "Quiero agua."},
    ]
    with TestClient(create_app(SETTINGS, transport(calls))) as client:
        assert client.get("/health").json()["ok"] is True
        catalog = client.get("/api/scenarios").json()["scenarios"]
        created = client.post("/api/sessions", json={"scenarioId": "order-food"})
        session_id = created.json()["sessionId"]
        url = f"/api/sessions/{session_id}"
        turn = client.post(f"{url}/turns", json={"turnId": 1, "transcript": transcript})
        duplicate_turn = client.post(f"{url}/turns", json={"turnId": 1, "transcript": transcript})
        translation = client.post(f"{url}/translations", json={"text": "¿Quiere algo?"})
        duplicate_translation = client.post(f"{url}/translations", json={"text": "¿Quiere algo?"})
        suggestion = client.post(f"{url}/suggestions", json={"transcript": transcript})
        duplicate_suggestion = client.post(f"{url}/suggestions", json={"transcript": transcript})
        ended = client.post(f"{url}/end", json={"transcript": transcript})

    assert catalog and set(catalog[0]) == {"scenarioId", "title"}
    catalog_order = [(item["title"].casefold(), item["scenarioId"]) for item in catalog]
    assert catalog_order == sorted(catalog_order)
    assert created.status_code == 200
    assert created.json()["persona"]["sessionDetails"] == {
        "server_url": "wss://keyframe.test/session",
        "participant_token": "participant-token",
        "agent_identity": "agent-identity",
    }
    assert created.json()["persona"]["voiceAgentDetails"] == {
        "type": "elevenlabs",
        "agent_id": "agent-test",
        "signed_url": "wss://eleven.test/conversation",
    }
    assert (
        "Use common, high-frequency Spanish vocabulary"
        in created.json()["persona"]["dynamicVariables"]["scenario_prompt"]
    )
    assert turn.json() == duplicate_turn.json() == {"turnId": 1, **FEEDBACK}
    assert translation.json() == duplicate_translation.json() == TRANSLATION
    assert suggestion.json() == duplicate_suggestion.json() == SUGGESTION
    assert ended.json() == {
        "scenarioId": "order-food",
        "scenarioTitle": "Order food",
        "learnerTurns": [{"turnId": 1, "text": "Quiero agua.", "feedback": FEEDBACK}],
    }
    openrouter = [request for request in calls if request.url.host == "openrouter.ai"]
    assert len(openrouter) == 3
    assert all(json.loads(request.content)["response_format"]["json_schema"]["strict"] for request in openrouter)
    assert all(json.loads(request.content)["provider"]["require_parameters"] is True for request in openrouter)
    keyframe = next(request for request in calls if request.url.host == "api.keyframelabs.com")
    assert keyframe.url.path == "/v1/sessions"
    assert json.loads(keyframe.content) == {"persona_slug": "persona-test"}
    elevenlabs = next(request for request in calls if request.url.host == "api.elevenlabs.io")
    assert elevenlabs.url.path == "/v1/convai/conversation/get-signed-url"
    assert dict(elevenlabs.url.params) == {"agent_id": "agent-test"}


@pytest.mark.parametrize(
    ("feedback", "suggestion_spanish", "suggestion_english"),
    [
        ("Needs Improvement", "Quiero agua.", "I want water."),
        ("That wasn't nice.", None, None),
    ],
)
def test_unsuccessful_feedback_requires_a_reason(
    feedback: str,
    suggestion_spanish: str | None,
    suggestion_english: str | None,
) -> None:
    with pytest.raises(ValidationError, match="Unsuccessful feedback reasons must not be blank"):
        Feedback.model_validate(
            {
                "feedback": feedback,
                "suggestionSpanish": suggestion_spanish,
                "suggestionEnglish": suggestion_english,
                "reason": "",
            }
        )


def test_evaluation_retries_invalid_model_output() -> None:
    calls: list[httpx.Request] = []
    with TestClient(create_app(SETTINGS, transport(calls, "spanish_turn_feedback", invalid_once=True))) as client:
        created = client.post("/api/sessions", json={"scenarioId": "order-food"})
        response = client.post(
            f"/api/sessions/{created.json()['sessionId']}/turns",
            json={"turnId": 1, "transcript": [{"role": "user", "text": "Hola."}]},
        )

    assert response.status_code == 200
    assert len([call for call in calls if call.url.host == "openrouter.ai"]) == 2
    retry = json.loads(calls[-1].content)
    assert "validationFeedback" in json.loads(retry["messages"][1]["content"])


def test_provider_and_structured_output_failures_are_safe() -> None:
    cases = [
        ("provider", "/api/sessions", {"scenarioId": "order-food"}),
        (
            "spanish_turn_feedback",
            "turns",
            {"turnId": 1, "transcript": [{"role": "user", "text": "Hola."}]},
        ),
        ("avatar_transcript_translation", "translations", {"text": "¿Quiere algo?"}),
        (
            "guided_suggested_response",
            "suggestions",
            {"transcript": [{"role": "assistant", "text": "¿Qué desea?"}]},
        ),
    ]
    for invalid, endpoint, payload in cases:
        calls: list[httpx.Request] = []
        with TestClient(create_app(SETTINGS, transport(calls, invalid))) as client:
            if endpoint == "/api/sessions":
                response = client.post(endpoint, json=payload)
            else:
                created = client.post("/api/sessions", json={"scenarioId": "order-food"})
                response = client.post(f"/api/sessions/{created.json()['sessionId']}/{endpoint}", json=payload)

        assert response.status_code == 502
        assert set(response.json()) == {"error"}
        assert "hidden" not in response.text
