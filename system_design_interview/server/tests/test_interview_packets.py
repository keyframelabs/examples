from app.interview_packets import (
    DEFAULT_INTERVIEW_PACKET_ID,
    DEFAULT_TURN_EAGERNESS,
    DEFAULT_TURN_TIMEOUT_SECONDS,
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

    assert "# Personality" in packet.prompt
    assert "# Interview flow" in packet.prompt
    assert "# Guardrails" in packet.prompt
    assert "# Private interviewer reference" in packet.prompt
    assert "## Possible solution families" in packet.prompt
    assert "## Strong design direction" in packet.prompt
    assert "Never provide or reveal the answer" in packet.prompt


def test_tinyurl_packet_defines_guidance_boundary_and_edge_cases() -> None:
    packet = get_interview_packet(DEFAULT_INTERVIEW_PACKET_ID)

    assert "Treat a reasonable design choice as accepted" in packet.prompt
    assert "Do not challenge every proposal or require the optimal choice" in packet.prompt
    assert "First ask the candidate to explain the choice or extend the design" in packet.prompt
    assert "Raise a risk only when it materially affects" in packet.prompt
    assert "accept a defensible tradeoff and move to the next design phase" in packet.prompt
    assert "use progressively stronger guidance to keep the interview moving" in packet.prompt
    assert "require the candidate to determine the mitigation" in packet.prompt
    assert "### Silence" in packet.prompt
    assert "### Vague or minimal answers" in packet.prompt
    assert "### Off-topic answers" in packet.prompt
    assert "### Requests for the solution" in packet.prompt
    assert "### Conflicting spoken and canvas designs" in packet.prompt
    assert "### Early termination" in packet.prompt
    assert "one brief acknowledgment followed by one focused question" in packet.prompt
    assert "approximately one or two short sentences" in packet.prompt
    assert "end_call" not in packet.prompt


def test_elevenlabs_payload_uses_packet_prompt_and_first_message() -> None:
    packet = get_interview_packet(DEFAULT_INTERVIEW_PACKET_ID)
    payload = build_elevenlabs_agent_update_payload(packet)
    agent = payload["conversation_config"]["agent"]

    assert agent["first_message"] == LYRA_FIRST_MESSAGE
    assert agent["disable_first_message_interruptions"] is True
    assert agent["prompt"]["prompt"] == packet.prompt
    assert payload["conversation_config"]["turn"] == {
        "turn_timeout": DEFAULT_TURN_TIMEOUT_SECONDS,
        "turn_eagerness": DEFAULT_TURN_EAGERNESS,
    }
