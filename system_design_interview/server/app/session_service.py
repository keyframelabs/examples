from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import httpx

from .interviews.interview_loader import InterviewPrompt
from .providers import INTERVIEW_PACKET_DYNAMIC_VARIABLE
from .schemas import (
    ElevenLabsSignedUrlResponse,
    KeyframeSessionDetails,
    LiveSessionResponse,
    VoiceAgentDetails,
)
from .settings import Settings

SettingValidator = Callable[[str | None, str], str]
KeyframeSessionCreator = Callable[
    [httpx.AsyncClient, str, Settings | None],
    Awaitable[KeyframeSessionDetails],
]
SignedUrlProvider = Callable[
    [httpx.AsyncClient, str, str, Settings | None],
    Awaitable[ElevenLabsSignedUrlResponse],
]


async def create_live_session(
    client: httpx.AsyncClient,
    settings: Settings,
    prompt: InterviewPrompt,
    *,
    setting_validator: SettingValidator,
    keyframe_session_creator: KeyframeSessionCreator,
    signed_url_provider: SignedUrlProvider,
) -> LiveSessionResponse:
    keyframe_api_key = setting_validator(settings.keyframe_api_key, "KEYFRAME_API_KEY")
    elevenlabs_api_key = setting_validator(settings.elevenlabs_api_key, "ELEVENLABS_API_KEY")
    elevenlabs_agent_id = setting_validator(settings.elevenlabs_agent_id, "ELEVENLABS_AGENT_ID")

    session_details, signed_url = await asyncio.gather(
        keyframe_session_creator(client, keyframe_api_key, settings),
        signed_url_provider(client, elevenlabs_api_key, elevenlabs_agent_id, settings),
    )

    return LiveSessionResponse(
        session_details=session_details,
        voice_agent_details=VoiceAgentDetails(
            agent_id=elevenlabs_agent_id,
            signed_url=signed_url.signed_url,
            dynamic_variables={INTERVIEW_PACKET_DYNAMIC_VARIABLE: prompt.prompt.strip()},
        ),
        conversation_id=signed_url.conversation_id,
    )
