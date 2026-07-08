from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import anyio
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main

ResponseFactory = Callable[[str, str, dict[str, Any]], "StubResponse"]
PRODUCTION_ENV_FILES = main.ENV_FILES


class StubResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        body: Any = None,
        text: str | None = None,
        reason_phrase: str = "OK",
        json_error: bool = False,
    ) -> None:
        self.status_code = status_code
        self.reason_phrase = reason_phrase
        self._body = body
        self._json_error = json_error

        if text is not None:
            self.text = text
            self.content = text.encode("utf-8")
        elif body is None:
            self.text = ""
            self.content = b""
        else:
            self.text = ""
            self.content = b"json"

    def json(self) -> Any:
        if self._json_error:
            raise ValueError("not JSON")

        return self._body


class StubAsyncClient:
    def __init__(self, response: StubResponse | ResponseFactory) -> None:
        self._response = response
        self.requests: list[dict[str, Any]] = []

    async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
        self.requests.append({"args": (method, url), "kwargs": kwargs})
        if callable(self._response):
            return self._response(method, url, kwargs)
        return self._response


def run_async(awaitable: Any) -> Any:
    async def runner() -> Any:
        return await awaitable

    return anyio.run(runner)


def make_settings() -> main.Settings:
    return main.Settings(_env_file=None)


def test_settings_loads_only_root_env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    assert PRODUCTION_ENV_FILES == (main.ROOT_DIR / ".env",)

    root_env = tmp_path / ".env"
    server_dir = tmp_path / "server"
    server_dir.mkdir()
    server_env = server_dir / ".env"
    root_env.write_text(
        "\n".join(
            [
                "KEYFRAME_PERSONA_SLUG=root-persona",
                "CLIENT_ORIGIN=http://root.example",
                "PROVIDER_TIMEOUT_SECONDS=12",
            ]
        ),
        encoding="utf-8",
    )
    server_env.write_text(
        "\n".join(
            [
                "KEYFRAME_PERSONA_SLUG=server-persona",
                "CLIENT_ORIGIN=http://server.example",
                "PROVIDER_TIMEOUT_SECONDS=99",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(main, "ENV_FILES", (root_env,))
    main.get_settings.cache_clear()

    settings = main.get_settings()

    assert settings.keyframe_persona_slug == "root-persona"
    assert settings.client_origins == ["http://root.example"]
    assert settings.provider_timeout_seconds == 12


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


def test_provider_json_success_uses_injected_async_client() -> None:
    client = StubAsyncClient(StubResponse(body={"signed_url": "wss://voice.example/session"}))

    result = run_async(
        main.provider_json(
            client,
            "GET",
            "https://provider.example/resource",
            {"x-api-key": "secret"},
            None,
            "Provider request failed",
            params={"agent_id": "agent_123"},
        )
    )

    assert result == {"signed_url": "wss://voice.example/session"}
    assert client.requests == [
        {
            "args": ("GET", "https://provider.example/resource"),
            "kwargs": {
                "headers": {"x-api-key": "secret"},
                "params": {"agent_id": "agent_123"},
            },
        }
    ]


def test_provider_json_timeout_returns_provider_specific_504() -> None:
    class TimeoutClient:
        async def request(self, *_args: Any, **_kwargs: Any) -> StubResponse:
            raise httpx.TimeoutException("read timed out")

    with pytest.raises(HTTPException) as exc_info:
        run_async(
            main.provider_json(
                TimeoutClient(),
                "GET",
                "https://provider.example/resource",
                {},
                None,
                "ElevenLabs signed URL request failed",
            )
        )

    assert exc_info.value.status_code == 504
    assert exc_info.value.detail == "ElevenLabs signed URL request failed: provider request timed out."


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"detail": "detail failure"}, "detail failure"),
        ({"message": "message failure"}, "message failure"),
        ({"error": "error failure"}, "error failure"),
    ],
)
def test_provider_json_error_surfaces_json_detail_values(body: dict[str, str], expected: str) -> None:
    client = StubAsyncClient(StubResponse(status_code=400, body=body, reason_phrase="Bad Request"))

    with pytest.raises(HTTPException) as exc_info:
        run_async(
            main.provider_json(
                client,
                "POST",
                "https://provider.example/resource",
                {},
                {"hello": "world"},
                "Provider request failed",
            )
        )

    assert exc_info.value.status_code == 400
    assert expected in str(exc_info.value.detail)


def test_provider_json_error_surfaces_text_safely() -> None:
    provider_text = "provider text failure " + ("x" * 650)
    client = StubAsyncClient(
        StubResponse(
            status_code=502,
            text=provider_text,
            reason_phrase="Bad Gateway",
            json_error=True,
        )
    )

    with pytest.raises(HTTPException) as exc_info:
        run_async(
            main.provider_json(
                client,
                "GET",
                "https://provider.example/resource",
                {},
                None,
                "Provider request failed",
            )
        )

    detail = str(exc_info.value.detail)
    assert exc_info.value.status_code == 502
    assert provider_text[:500] in detail
    assert len(detail) < len(f"Provider request failed: {provider_text}")


@pytest.mark.parametrize(
    "response",
    [
        StubResponse(text="plain success", json_error=True),
        StubResponse(body=["not", "an", "object"]),
        StubResponse(body="also not an object"),
    ],
)
def test_provider_json_success_rejects_non_object_bodies(response: StubResponse) -> None:
    client = StubAsyncClient(response)

    with pytest.raises(HTTPException) as exc_info:
        run_async(
            main.provider_json(
                client,
                "GET",
                "https://provider.example/resource",
                {},
                None,
                "Provider request failed",
            )
        )

    assert exc_info.value.status_code == 502
    assert "provider returned unexpected JSON" in str(exc_info.value.detail)


def test_keyframe_session_response_is_validated_with_pydantic() -> None:
    client = StubAsyncClient(
        StubResponse(
            body={
                "server_url": "wss://keyframe.example/live",
                "participant_token": "participant-token",
                "agent_identity": "avatar-agent",
                "provider_extra": "kept",
            }
        )
    )

    result = run_async(main.create_keyframe_session(client, "keyframe-key", make_settings()))

    assert isinstance(result, main.KeyframeSessionDetails)
    assert result.server_url == "wss://keyframe.example/live"
    assert result.model_extra == {"provider_extra": "kept"}
    assert client.requests[0] == {
        "args": ("POST", "https://api.keyframelabs.com/v1/sessions"),
        "kwargs": {
            "headers": {
                "Authorization": "Bearer keyframe-key",
                "Content-Type": "application/json",
            },
            "json": {"persona_slug": "public:lyra_persona-1.5-live"},
        },
    }


@pytest.mark.parametrize("missing_key", ["server_url", "participant_token", "agent_identity"])
def test_keyframe_session_rejects_missing_required_provider_fields(missing_key: str) -> None:
    body = {
        "server_url": "wss://keyframe.example/live",
        "participant_token": "participant-token",
        "agent_identity": "avatar-agent",
    }
    body.pop(missing_key)
    client = StubAsyncClient(StubResponse(body=body))

    with pytest.raises(HTTPException) as exc_info:
        run_async(main.create_keyframe_session(client, "keyframe-key", make_settings()))

    assert exc_info.value.status_code == 502
    assert f"provider response missing {missing_key}" in str(exc_info.value.detail)


def test_elevenlabs_signed_url_uses_request_params_and_ignores_extra_fields() -> None:
    settings = main.Settings(elevenlabs_api_base_url="https://elevenlabs.test", _env_file=None)
    client = StubAsyncClient(
        StubResponse(
            body={
                "signed_url": "wss://voice.example/session",
                "conversation_id": "conversation_123",
                "ignored": "nope",
            }
        )
    )

    result = run_async(main.get_elevenlabs_signed_url(client, "eleven-key", "agent_123", settings))

    assert isinstance(result, main.ElevenLabsSignedUrlResponse)
    assert result.signed_url == "wss://voice.example/session"
    assert result.conversation_id == "conversation_123"
    assert "ignored" not in result.model_dump()
    assert client.requests[0] == {
        "args": ("GET", "https://elevenlabs.test/v1/convai/conversation/get-signed-url"),
        "kwargs": {
            "headers": {"xi-api-key": "eleven-key"},
            "params": {
                "agent_id": "agent_123",
                "include_conversation_id": "true",
            },
        },
    }


def test_elevenlabs_signed_url_rejects_missing_signed_url() -> None:
    client = StubAsyncClient(StubResponse(body={"conversation_id": "conversation_123"}))

    with pytest.raises(HTTPException) as exc_info:
        run_async(main.get_elevenlabs_signed_url(client, "eleven-key", "agent_123", make_settings()))

    assert exc_info.value.status_code == 502
    assert "provider response missing signed_url" in str(exc_info.value.detail)


def test_create_session_endpoint_uses_shared_lifespan_client_and_preserves_wire_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()

    class RecordingLifecycleClient:
        inits: list[dict[str, Any]] = []
        exits: list[int] = []
        requests: list[dict[str, Any]] = []

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.instance_id = len(self.inits) + 1
            self.inits.append({"args": args, "kwargs": kwargs})

        async def __aenter__(self) -> "RecordingLifecycleClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            self.exits.append(self.instance_id)

        async def request(self, method: str, url: str, **kwargs: Any) -> StubResponse:
            self.requests.append(
                {
                    "client_id": self.instance_id,
                    "method": method,
                    "url": url,
                    "kwargs": kwargs,
                }
            )
            if method == "PATCH":
                raise AssertionError("session creation must not update persistent ElevenLabs agent settings")
            if "keyframelabs" in url:
                return StubResponse(
                    body={
                        "server_url": "wss://keyframe.example/live",
                        "participant_token": "participant-token",
                        "agent_identity": "avatar-agent",
                        "provider_extra": "kept",
                    }
                )
            return StubResponse(
                body={
                    "signed_url": "wss://elevenlabs.example/conversation",
                    "conversation_id": "conversation_123",
                    "ignored": "nope",
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
            "provider_extra": "kept",
        },
        "voiceAgentDetails": {
            "type": "elevenlabs",
            "agent_id": "agent_123",
            "signed_url": "wss://elevenlabs.example/conversation",
            "dynamic_variables": {
                "interviewer_name": "Lyra",
                "interview_type": "system design",
                "canvas_context_format": "Serialized Canvas v8 architecture text",
            },
        },
        "conversationId": "conversation_123",
    }
    assert RecordingLifecycleClient.inits == [{"args": (), "kwargs": {"timeout": 35.0}}]
    assert RecordingLifecycleClient.exits == [1]
    assert len(RecordingLifecycleClient.requests) == 2
    assert {request["client_id"] for request in RecordingLifecycleClient.requests} == {1}
    assert {request["method"] for request in RecordingLifecycleClient.requests} == {"POST", "GET"}
    assert all("/v1/convai/agents/" not in request["url"] for request in RecordingLifecycleClient.requests)


def test_lifespan_client_uses_configured_provider_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROVIDER_TIMEOUT_SECONDS", "12.5")
    main.get_settings.cache_clear()

    class RecordingLifecycleClient:
        inits: list[dict[str, Any]] = []
        exits: list[int] = []

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.instance_id = len(self.inits) + 1
            self.inits.append({"args": args, "kwargs": kwargs})

        async def __aenter__(self) -> "RecordingLifecycleClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            self.exits.append(self.instance_id)

    monkeypatch.setattr(main.httpx, "AsyncClient", RecordingLifecycleClient)

    with TestClient(main.app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert RecordingLifecycleClient.inits == [{"args": (), "kwargs": {"timeout": 12.5}}]
    assert RecordingLifecycleClient.exits == [1]


def test_create_session_endpoint_runs_session_helpers_concurrently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()
    events: list[str] = []

    event_holder: dict[str, anyio.Event] = {}
    started: set[str] = set()

    def both_started() -> anyio.Event:
        event = event_holder.get("both_started")
        if event is None:
            event = anyio.Event()
            event_holder["both_started"] = event
        return event

    def mark_started(name: str) -> None:
        started.add(name)
        if started == {"keyframe", "signed_url"}:
            both_started().set()

    async def fake_create_keyframe_session(
        client: Any,
        api_key: str,
        settings: main.Settings,
    ) -> main.KeyframeSessionDetails:
        assert api_key == "keyframe-key"
        events.append("keyframe:start")
        mark_started("keyframe")
        await both_started().wait()
        events.append("keyframe:end")
        return main.KeyframeSessionDetails(
            server_url="wss://keyframe.example/live",
            participant_token="participant-token",
            agent_identity="avatar-agent",
        )

    async def fake_get_elevenlabs_signed_url(
        client: Any,
        api_key: str,
        agent_id: str,
        settings: main.Settings,
    ) -> main.ElevenLabsSignedUrlResponse:
        assert api_key == "eleven-key"
        assert agent_id == "agent_123"
        events.append("signed_url:start")
        mark_started("signed_url")
        await both_started().wait()
        events.append("signed_url:end")
        return main.ElevenLabsSignedUrlResponse(
            signed_url="wss://elevenlabs.example/conversation",
            conversation_id="conversation_123",
        )

    monkeypatch.setattr(main, "create_keyframe_session", fake_create_keyframe_session)
    monkeypatch.setattr(main, "get_elevenlabs_signed_url", fake_get_elevenlabs_signed_url)

    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 200
    assert max(events.index("keyframe:start"), events.index("signed_url:start")) < min(
        events.index("keyframe:end"),
        events.index("signed_url:end"),
    )


def test_create_session_endpoint_reports_missing_required_settings() -> None:
    with TestClient(main.app) as client:
        response = client.post("/api/session")

    assert response.status_code == 400
    assert response.json() == {"error": "Missing KEYFRAME_API_KEY. Add it to .env and restart pnpm dev."}


def test_generic_error_handler_returns_stable_public_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYFRAME_API_KEY", "keyframe-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_123")
    main.get_settings.cache_clear()

    async def fail_create_keyframe_session(*_args: Any, **_kwargs: Any) -> main.KeyframeSessionDetails:
        raise RuntimeError("secret provider detail")

    async def fake_get_elevenlabs_signed_url(*_args: Any, **_kwargs: Any) -> main.ElevenLabsSignedUrlResponse:
        return main.ElevenLabsSignedUrlResponse(
            signed_url="wss://elevenlabs.example/conversation",
            conversation_id="conversation_123",
        )

    monkeypatch.setattr(main, "create_keyframe_session", fail_create_keyframe_session)
    monkeypatch.setattr(main, "get_elevenlabs_signed_url", fake_get_elevenlabs_signed_url)

    with TestClient(main.app, raise_server_exceptions=False) as client:
        response = client.post("/api/session")

    assert response.status_code == 500
    assert response.json() == {"error": "Internal server error."}


def test_node_provider_bridge_removed() -> None:
    server_dir = Path(main.ROOT_DIR) / "server"
    assert not (server_dir / "app" / "provider_request.mjs").exists()
    assert not (server_dir / "package.json").exists()
    assert list(server_dir.rglob("*.js")) == []
    assert list(server_dir.rglob("*.mjs")) == []

    source = (server_dir / "app" / "main.py").read_text(encoding="utf-8")
    assert "PROVIDER_REQUEST_SCRIPT" not in source
    assert "asyncio.to_thread" not in source
    assert "subprocess" not in source
    assert '"node"' not in source
