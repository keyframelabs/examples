from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.main import AppSettings, create_app, load_evaluation_prompt
from backend.scenario_prompts import ScenarioPromptValidationError, load_scenario_prompts

SETTINGS = AppSettings(
    keyframe_api_key="keyframe-test",
    keyframe_persona_slug="persona-test",
    elevenlabs_api_key="eleven-test",
    elevenlabs_agent_id="agent-test",
    openrouter_api_key="openrouter-test",
)
GREAT = {
    "feedback": "Great Job!",
    "suggestionSpanish": None,
    "suggestionEnglish": None,
    "reason": "The response is clear and appropriate.",
}
BLANK = {
    "feedback": "Needs Improvement",
    "suggestionSpanish": "Me gustaría el pollo.",
    "suggestionEnglish": "I would like the chicken.",
    "reason": "Respond to the server's question.",
}
TRANSLATION = {"translation": "Would you like something to drink?"}


def transport(calls: list[httpx.Request], bad: str | None = None) -> httpx.MockTransport:
    async def provider(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        host = request.url.host
        if host == "api.keyframelabs.com":
            body: Any = {
                "server_url": "wss://keyframe.test/session",
                "participant_token": "participant-token",
                "agent_identity": "agent-identity",
                "ignored": "field",
            }
            if bad == "keyframe":
                body = {}
        elif host == "api.elevenlabs.io":
            body = {} if bad == "elevenlabs" else {"signed_url": "wss://eleven.test/conversation"}
        elif host == "openrouter.ai":
            request_body = json.loads(request.content)
            schema_name = request_body["response_format"]["json_schema"]["name"]
            if schema_name == "avatar_transcript_translation":
                body = {"choices": [{"message": {"content": json.dumps(TRANSLATION)}}]}
                if bad == "translation-malformed":
                    body = {"choices": [{"message": {"content": '{"translation": null}'}}]}
            else:
                transcript = json.loads(request_body["messages"][1]["content"])["transcript"]
                feedback = BLANK if transcript[-1]["message"] == "" else GREAT
                body = {"choices": [{"message": {"content": json.dumps(feedback)}}]}
            if bad in {"openrouter", "translation-provider"}:
                body = {"error": {"message": "secret upstream detail"}}
        else:
            raise AssertionError(f"Unexpected provider: {host}")
        return httpx.Response(200, json=body, request=request)

    return httpx.MockTransport(provider)


def test_full_mocked_flow_including_blank_and_duplicate_turns() -> None:
    calls: list[httpx.Request] = []
    transcript = [
        {"role": "agent", "message": "¿Qué desea?"},
        {"role": "user", "message": "Hola."},
        {"role": "assistant", "text": "¿Algo más?"},
        {"role": "user", "text": ""},
    ]
    with TestClient(create_app(SETTINGS, transport(calls))) as client:
        catalog = client.get("/api/scenarios").json()["scenarios"]
        created = client.post("/api/sessions", json={"scenarioId": "order-food"})
        session_id = created.json()["sessionId"]
        url = f"/api/sessions/{session_id}"
        first_payload = {"turnId": 1, "transcript": transcript[:2]}
        first = client.post(f"{url}/turns", json=first_payload)
        duplicate = client.post(f"{url}/turns", json=first_payload)
        blank = client.post(f"{url}/turns", json={"turnId": 2, "transcript": transcript})
        ended = client.post(f"{url}/end", json={"transcript": transcript})
        missing = client.post(f"{url}/end", json={"transcript": transcript})

    assert catalog[0]["skillLevel"] == "Beginner"
    assert all(set(item) == {"scenarioId", "title", "skillLevel"} for item in catalog)
    scenario = load_scenario_prompts()["order-food"]
    assert created.status_code == 200
    assert created.json()["persona"] == {
        "sessionDetails": {
            "server_url": "wss://keyframe.test/session",
            "participant_token": "participant-token",
            "agent_identity": "agent-identity",
        },
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": "agent-test",
            "signed_url": "wss://eleven.test/conversation",
        },
        "dynamicVariables": {
            "scenario_prompt": scenario.prompt,
            "scenario_opening_message": scenario.opening_message,
        },
    }
    assert first.json() == duplicate.json() == {"turnId": 1, **GREAT}
    assert blank.json() == {"turnId": 2, **BLANK}
    assert ended.json() == {
        "scenarioTitle": "Order food",
        "learnerTurns": [
            {"turnId": 1, "text": "Hola.", "feedback": GREAT},
            {"turnId": 2, "text": "", "feedback": BLANK},
        ],
    }
    assert missing.status_code == 404
    openrouter = [call for call in calls if call.url.host == "openrouter.ai"]
    assert len(openrouter) == 2
    request_body = json.loads(openrouter[0].content)
    assert request_body["provider"] == {
        "allow_fallbacks": True,
        "require_parameters": True,
        "sort": "latency",
    }
    assert "invent one short, plausible Spanish response" in request_body["messages"][0]["content"]


@pytest.mark.parametrize(
    ("bad", "endpoint", "expected"),
    [
        ("elevenlabs", "create", "ElevenLabs signed URL request failed"),
        ("keyframe", "create", "Keyframe session creation failed"),
        ("openrouter", "turn", "OpenRouter evaluation failed"),
    ],
)
def test_provider_failures_are_safe(bad: str, endpoint: str, expected: str) -> None:
    calls: list[httpx.Request] = []
    with TestClient(create_app(SETTINGS, transport(calls, bad))) as client:
        response = client.post("/api/sessions", json={"scenarioId": "order-food"})
        if endpoint == "turn":
            response = client.post(
                f"/api/sessions/{response.json()['sessionId']}/turns",
                json={"turnId": 1, "transcript": [{"role": "user", "text": "Hola."}]},
            )
    assert response.status_code == 502
    assert expected in response.json()["error"]
    assert "secret upstream detail" not in response.text


def test_avatar_translation_success_cache_reuse_and_exact_keys() -> None:
    calls: list[httpx.Request] = []
    with TestClient(create_app(SETTINGS, transport(calls))) as client:
        created = client.post("/api/sessions", json={"scenarioId": "order-food"})
        session_id = created.json()["sessionId"]
        url = f"/api/sessions/{session_id}/translations"
        first = client.post(url, json={"text": "¿Quiere algo de beber?"})
        duplicate = client.post(url, json={"text": "¿Quiere algo de beber?"})
        whitespace_variant = client.post(url, json={"text": "¿Quiere algo de beber? "})

    assert first.status_code == duplicate.status_code == whitespace_variant.status_code == 200
    assert first.json() == duplicate.json() == whitespace_variant.json() == TRANSLATION
    openrouter = [call for call in calls if call.url.host == "openrouter.ai"]
    assert len(openrouter) == 2
    request_body = json.loads(openrouter[0].content)
    assert request_body["model"] == SETTINGS.openrouter_model
    assert request_body["provider"] == {
        "allow_fallbacks": True,
        "require_parameters": True,
        "sort": "latency",
    }
    assert request_body["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "avatar_transcript_translation",
            "strict": True,
            "schema": {
                "additionalProperties": False,
                "properties": {"translation": {"minLength": 1, "title": "Translation", "type": "string"}},
                "required": ["translation"],
                "title": "TranscriptTranslation",
                "type": "object",
            },
        },
    }
    assert json.loads(request_body["messages"][1]["content"]) == {"text": "¿Quiere algo de beber?"}


def test_avatar_translation_rejects_missing_session_and_blank_text() -> None:
    calls: list[httpx.Request] = []
    with TestClient(create_app(SETTINGS, transport(calls))) as client:
        missing = client.post("/api/sessions/missing/translations", json={"text": "¿Hola?"})
        blank = client.post("/api/sessions/missing/translations", json={"text": "  "})

    assert missing.status_code == 404
    assert missing.json() == {"error": "Session not found."}
    assert blank.status_code == 422
    assert blank.json() == {"error": "Invalid request."}
    assert not calls


@pytest.mark.parametrize("bad", ["translation-malformed", "translation-provider"])
def test_avatar_translation_provider_failures_are_safe(bad: str) -> None:
    calls: list[httpx.Request] = []
    with TestClient(create_app(SETTINGS, transport(calls, bad))) as client:
        created = client.post("/api/sessions", json={"scenarioId": "order-food"})
        response = client.post(
            f"/api/sessions/{created.json()['sessionId']}/translations",
            json={"text": "¿Quiere algo de beber?"},
        )

    assert response.status_code == 502
    assert "OpenRouter translation failed" in response.json()["error"]
    assert "secret upstream detail" not in response.text


def test_scenario_and_evaluation_prompts_fail_fast(tmp_path: Path) -> None:
    (tmp_path / "bad.md").write_text(
        "---\ndisplay_name: Bad\nskill_level: Beginner\nopening_message: Hola\nextra: no\n---\nPrompt",
        encoding="utf-8",
    )
    with pytest.raises(ScenarioPromptValidationError, match="unsupported metadata field `extra`"):
        load_scenario_prompts(tmp_path)
    empty = tmp_path / "empty.md"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(RuntimeError, match="must not be empty"):
        load_evaluation_prompt(empty)
