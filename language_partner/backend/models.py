from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from time import monotonic
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

PERSONA_SLUG = "public:caspian_persona-1.5-live"
ELEVENLABS_URL = "https://api.elevenlabs.io"
CLIENT_ORIGIN = "http://localhost:5174"


def word_count(value: str) -> int:
    return len(re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", value, flags=re.UNICODE))


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class TranscriptEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["user", "assistant"]
    text: str

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = value.copy()
        if normalized.get("role") == "agent":
            normalized["role"] = "assistant"
        if normalized.get("text") is None:
            normalized["text"] = normalized.get("message")
        return normalized


class Feedback(ApiModel):
    feedback: Literal["Great Job!", "Needs Improvement", "That wasn't nice."]
    suggestion_spanish: str | None = Field(min_length=1)
    suggestion_english: str | None = Field(min_length=1)
    reason: str

    @model_validator(mode="after")
    def validate_fields(self) -> Feedback:
        needs_suggestion = self.feedback == "Needs Improvement"
        if (self.suggestion_spanish is not None) != needs_suggestion:
            raise ValueError("Spanish suggestion does not match feedback.")
        if (self.suggestion_english is not None) != needs_suggestion:
            raise ValueError("English suggestion does not match feedback.")
        if self.feedback != "Great Job!" and not self.reason.strip():
            raise ValueError("Unsuccessful feedback reasons must not be blank.")
        if word_count(self.reason) > 12:
            raise ValueError("Feedback reasons must contain no more than 12 words.")
        return self


class CreateSessionRequest(ApiModel):
    scenario_id: str


class EvaluateTurnRequest(ApiModel):
    turn_id: int = Field(ge=1)
    transcript: list[TranscriptEntry] = Field(min_length=1)


class EndSessionRequest(ApiModel):
    transcript: list[TranscriptEntry] = Field(default_factory=list)


class TranslateTranscriptRequest(ApiModel):
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def require_spoken_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Transcript must not be blank.")
        return value


class BilingualSegment(ApiModel):
    spanish: str = Field(min_length=1, max_length=180)
    english: str = Field(min_length=1, max_length=240)

    @model_validator(mode="after")
    def validate_segment(self) -> BilingualSegment:
        if self.spanish != self.spanish.strip() or self.english != self.english.strip():
            raise ValueError("Bilingual segments must not contain surrounding whitespace.")
        return self


class TranscriptTranslation(ApiModel):
    translation: str = Field(min_length=1)
    segments: list[BilingualSegment] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_reconstruction(self) -> TranscriptTranslation:
        if " ".join(segment.english for segment in self.segments) != self.translation:
            raise ValueError("English segments must reconstruct the translation exactly.")
        return self

    def spanish_text(self) -> str:
        return " ".join(segment.spanish for segment in self.segments)


class SuggestedResponseRequest(ApiModel):
    transcript: list[TranscriptEntry] = Field(min_length=1)


ConversationMove = Literal[
    "introduce",
    "answer",
    "accept",
    "decline",
    "ask",
    "request",
    "clarify",
    "acknowledge",
    "thank",
    "close",
]


class SuggestedResponse(ApiModel):
    response: str = Field(min_length=1, max_length=180)
    translation: str = Field(min_length=1, max_length=240)
    segments: list[BilingualSegment] = Field(min_length=1, max_length=12)
    conversation_move: ConversationMove
    follow_up_move: ConversationMove | None

    @model_validator(mode="after")
    def validate_response(self) -> SuggestedResponse:
        if word_count(self.response) > 12:
            raise ValueError("Suggested responses may contain at most twelve words.")
        if " ".join(segment.spanish for segment in self.segments) != self.response:
            raise ValueError("Spanish segments must reconstruct the response exactly.")
        if " ".join(segment.english for segment in self.segments) != self.translation:
            raise ValueError("English segments must reconstruct the translation exactly.")
        return self


@dataclass(frozen=True, slots=True)
class AppSettings:
    keyframe_api_key: str | None = None
    keyframe_persona_slug: str = PERSONA_SLUG
    elevenlabs_api_key: str | None = None
    elevenlabs_agent_id: str | None = None
    elevenlabs_api_base_url: str = ELEVENLABS_URL
    openrouter_api_key: str | None = None
    openrouter_guided_model: str | None = None
    openrouter_utility_model: str | None = None
    openrouter_provider: str | None = None
    openrouter_allow_fallbacks: bool = True
    client_origins: tuple[str, ...] = (CLIENT_ORIGIN,)

    @classmethod
    def from_env(cls) -> AppSettings:
        fallback = os.getenv("OPENROUTER_ALLOW_FALLBACKS", "true").strip().lower()
        if fallback not in {"1", "true", "yes", "on", "0", "false", "no", "off"}:
            raise ValueError("OPENROUTER_ALLOW_FALLBACKS must be true or false")
        return cls(
            keyframe_api_key=os.getenv("KEYFRAME_API_KEY"),
            keyframe_persona_slug=os.getenv("KEYFRAME_PERSONA_SLUG") or PERSONA_SLUG,
            elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY"),
            elevenlabs_agent_id=os.getenv("ELEVENLABS_AGENT_ID"),
            elevenlabs_api_base_url=os.getenv("ELEVENLABS_API_BASE_URL") or ELEVENLABS_URL,
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
            openrouter_guided_model=os.getenv("OPENROUTER_GUIDED_MODEL") or None,
            openrouter_utility_model=os.getenv("OPENROUTER_UTILITY_MODEL") or None,
            openrouter_provider=os.getenv("OPENROUTER_PROVIDER") or None,
            openrouter_allow_fallbacks=fallback in {"1", "true", "yes", "on"},
            client_origins=tuple(filter(None, os.getenv("CLIENT_ORIGIN", CLIENT_ORIGIN).split(","))),
        )


@dataclass
class Session:
    scenario_id: str
    feedback: dict[int, Feedback] = field(default_factory=dict)
    translations: dict[str, TranscriptTranslation] = field(default_factory=dict)
    suggestions: dict[str, SuggestedResponse] = field(default_factory=dict)
    last_activity: float = field(default_factory=monotonic)
