from __future__ import annotations

import asyncio

import httpx

from . import providers
from .interviews.interview_loader import InterviewPrompt
from .schemas import LiveSessionResponse, VoiceAgentDetails
from .settings import Settings


async def create_live_session(
    client: httpx.AsyncClient,
    settings: Settings,
    prompt: InterviewPrompt,
) -> LiveSessionResponse:
    keyframe_api_key = providers.require_setting(settings.keyframe_api_key, "KEYFRAME_API_KEY")
    elevenlabs_api_key = providers.require_setting(settings.elevenlabs_api_key, "ELEVENLABS_API_KEY")
    elevenlabs_agent_id = providers.require_setting(settings.elevenlabs_agent_id, "ELEVENLABS_AGENT_ID")

    session_details, signed_url = await asyncio.gather(
        providers.create_keyframe_session(client, keyframe_api_key, settings),
        providers.get_elevenlabs_signed_url(client, elevenlabs_api_key, elevenlabs_agent_id, settings),
    )

    return LiveSessionResponse(
        session_details=session_details,
        voice_agent_details=VoiceAgentDetails(
            agent_id=elevenlabs_agent_id,
            signed_url=signed_url.signed_url,
            dynamic_variables={providers.INTERVIEW_PACKET_DYNAMIC_VARIABLE: prompt.prompt.strip()},
        ),
        conversation_id=signed_url.conversation_id,
    )
