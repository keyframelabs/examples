from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app import session_service
from app.interviews.interview_loader import InterviewPrompt
from app.schemas import ElevenLabsSignedUrlResponse, KeyframeSessionDetails, LiveSessionResponse
from app.settings import Settings


def test_concurrent_live_sessions_keep_interview_packets_isolated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        keyframe_api_key="keyframe-key",
        elevenlabs_api_key="eleven-key",
        elevenlabs_agent_id="agent_123",
    )
    first_prompt = InterviewPrompt(
        prompt_id="first-interview",
        display_name="First",
        skill_level="Intern",
        prompt="# First private prompt\n",
        source_path=Path("first-interview.md"),
    )
    second_prompt = InterviewPrompt(
        prompt_id="second-interview",
        display_name="Second",
        skill_level="Senior",
        prompt="# Second private prompt\n",
        source_path=Path("second-interview.md"),
    )

    async def create_keyframe_session(*_args: Any, **_kwargs: Any) -> KeyframeSessionDetails:
        await asyncio.sleep(0)
        return KeyframeSessionDetails(
            server_url="wss://keyframe.example/live",
            participant_token="participant-token",
            agent_identity="avatar-agent",
        )

    async def get_signed_url(*_args: Any, **_kwargs: Any) -> ElevenLabsSignedUrlResponse:
        await asyncio.sleep(0)
        return ElevenLabsSignedUrlResponse(signed_url="wss://elevenlabs.example/conversation")

    monkeypatch.setattr(session_service.providers, "create_keyframe_session", create_keyframe_session)
    monkeypatch.setattr(session_service.providers, "get_elevenlabs_signed_url", get_signed_url)

    async def create_sessions() -> list[LiveSessionResponse]:
        client = object()
        return await asyncio.gather(
            session_service.create_live_session(
                client,  # type: ignore[arg-type]
                settings,
                first_prompt,
            ),
            session_service.create_live_session(
                client,  # type: ignore[arg-type]
                settings,
                second_prompt,
            ),
        )

    first_session, second_session = asyncio.run(create_sessions())

    assert first_session.voice_agent_details.dynamic_variables == {
        "interview_packet": "# First private prompt",
    }
    assert second_session.voice_agent_details.dynamic_variables == {
        "interview_packet": "# Second private prompt",
    }
