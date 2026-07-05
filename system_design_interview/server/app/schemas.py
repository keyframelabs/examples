from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .interviews.interview_loader import DEFAULT_INTERVIEW_PROMPT_ID


class KeyframeSessionDetails(BaseModel):
    # extra="allow": the frontend forwards sessionDetails wholesale to the avatar SDK.
    model_config = ConfigDict(extra="allow")

    server_url: str
    participant_token: str
    agent_identity: str


class ElevenLabsSignedUrlResponse(BaseModel):
    signed_url: str


class VoiceAgentDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider_type: Literal["elevenlabs"] = Field(default="elevenlabs", alias="type")
    agent_id: str
    signed_url: str
    dynamic_variables: dict[str, str]


class LiveSessionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_details: KeyframeSessionDetails = Field(alias="sessionDetails")
    voice_agent_details: VoiceAgentDetails = Field(alias="voiceAgentDetails")


class InterviewCatalogItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    packet_id: str = Field(alias="packetId")
    title: str
    skill_level: Literal["Intern", "Junior", "Senior"] = Field(alias="skillLevel")


class InterviewCatalogResponse(BaseModel):
    interviews: list[InterviewCatalogItem]


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    packet_id: str = Field(default=DEFAULT_INTERVIEW_PROMPT_ID, alias="packetId")
