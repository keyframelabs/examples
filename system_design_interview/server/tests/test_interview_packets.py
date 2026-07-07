from app.interview_packets import (
    DEFAULT_INTERVIEW_PACKET_ID,
    LYRA_FIRST_MESSAGE,
    TINYURL_TRANSITION,
    get_interview_packet,
)
from app.main import build_elevenlabs_agent_update_payload


def test_tinyurl_packet_uses_conversational_opening_and_transition() -> None:
    packet = get_interview_packet(DEFAULT_INTERVIEW_PACKET_ID)

    assert packet.first_message == LYRA_FIRST_MESSAGE
    assert "How was your day?" in packet.first_message
    assert TINYURL_TRANSITION in packet.prompt
    assert "design the backend for TinyURL" in packet.prompt


def test_tinyurl_packet_contains_interview_constraints_and_private_guidance() -> None:
    packet = get_interview_packet(DEFAULT_INTERVIEW_PACKET_ID)

    assert "Do not provide the answer" in packet.prompt
    assert "Ask one focused question at a time" in packet.prompt
    assert "PRIVATE INTERNAL REFERENCE" in packet.prompt
    assert "Possible solution families" in packet.prompt
    assert "PRIVATE STRONG DESIGN DIRECTION" in packet.prompt


def test_elevenlabs_payload_uses_packet_prompt_and_first_message() -> None:
    packet = get_interview_packet(DEFAULT_INTERVIEW_PACKET_ID)
    payload = build_elevenlabs_agent_update_payload(packet)
    agent = payload["conversation_config"]["agent"]

    assert agent["first_message"] == LYRA_FIRST_MESSAGE
    assert agent["disable_first_message_interruptions"] is True
    assert agent["prompt"]["prompt"] == packet.prompt
