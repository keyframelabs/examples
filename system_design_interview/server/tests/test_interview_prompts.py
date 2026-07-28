from pathlib import Path

import pytest

from app.interviews.interview_loader import (
    DEFAULT_INTERVIEW_PROMPT_ID,
    LYRA_FIRST_MESSAGE,
    PROMPTS_DIR,
    InterviewPromptValidationError,
    get_interview_prompt,
    load_interview_prompt,
    load_interview_prompts,
)
from app.main import (
    INTERVIEW_PACKET_DYNAMIC_VARIABLE,
    INTERVIEW_PACKET_PLACEHOLDER,
    build_dynamic_elevenlabs_prompt,
    build_elevenlabs_agent_update_payload,
)

DEFAULT_PUBLIC_METADATA = """summary: A focused system design interview.
question_number: 99
skill_level: Junior
difficulty: Intermediate
focus:
  - Data model
tags:
  - databases"""


def write_prompt(path: Path, metadata: str, body: str = "# Prompt\n\nInterview the candidate.\n") -> None:
    path.write_text(
        f"---\n{metadata}\n{DEFAULT_PUBLIC_METADATA}\n---\n{body}",
        encoding="utf-8",
    )


def test_tinyurl_prompt_loads_public_metadata_and_private_guidance() -> None:
    path = PROMPTS_DIR / "tinyurl_interview_prompt.md"

    prompt = load_interview_prompt(path)

    assert prompt.prompt_id == DEFAULT_INTERVIEW_PROMPT_ID
    assert prompt.display_name == "TinyURL"
    assert prompt.skill_level == "Junior"
    assert prompt.difficulty == "Intermediate"
    assert "Caching" in prompt.focus
    assert "I want you to design TinyURL" in prompt.prompt
    assert "high-level summary of the current architecture" in prompt.prompt
    assert "detailed description of meaningful changes" in prompt.prompt
    assert "Canvas v12 state" in prompt.prompt
    assert "Answer with a clear point of view" in prompt.prompt
    assert 'Do not default to "it depends"' in prompt.prompt
    assert "requests for information" in prompt.prompt
    assert "TinyURL creates a new unique short URL for every submission" in prompt.prompt
    assert "Duplicate long URLs do not reuse an existing short URL" in prompt.prompt
    assert "Assume a simple website where users submit a long URL" in prompt.prompt
    assert "see both the original long URL and the generated short URL" in prompt.prompt
    assert "Not every response must end with a question" in prompt.prompt
    assert "Should the same long URL always return the same short URL?" not in prompt.prompt
    assert "Answer the question before asking a follow-up" in prompt.prompt
    assert "# Private interviewer reference" in prompt.prompt
    assert "Do not reveal or supply the solution during the candidate-led portion" in prompt.prompt
    assert LYRA_FIRST_MESSAGE not in prompt.prompt


def test_tinyurl_opening_moves_directly_into_problem() -> None:
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl_interview_prompt.md").prompt

    problem_transition = (
        "Got it. You'll lead the design on the canvas, and I'll ask a few "
        "follow-up questions as we go. Let's dive right in! I want you to design TinyURL. "
        "Are you familiar with TinyURL?"
    )

    assert problem_transition in prompt
    assert "do not add any more explanation of the interview structure" in prompt
    assert "Do you need me to clarify anything?" in prompt
    assert "What requirements would you clarify before designing?" not in prompt
    assert "Do not ask what requirements the candidate would like to clarify" in prompt
    assert "then invite the candidate to clarify requirements" not in prompt


def test_tinyurl_sql_path_and_closing_are_explicit() -> None:
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl_interview_prompt.md").prompt

    assert "let them completely finish that design" in prompt
    assert (
        "Reads significantly outweigh writes in this system. "
        "How would you adapt your design for that?"
    ) in prompt
    assert "Do not mention caching in the initial question" in prompt
    assert "Save the high-level NoSQL alternative for the closing summary" in prompt
    assert "Okay, now let's cover what went well and what you can improve on." in prompt
    assert (
        "using a distributed NoSQL key-value database because short-code redirects "
        "are simple, read-heavy lookups that benefit from horizontal scaling"
    ) in prompt
    assert "At a high level, I would use a URL service, NoSQL database, and cache." in prompt
    assert "Do you have any questions about utilizing NoSQL?" in prompt
    assert "Do not add more NoSQL reasons, components, implementation steps" in prompt
    assert (
        "It was wonderful talking with you. I encourage you to retry this TinyURL "
        "system design interview using the improvement I suggested."
    ) in prompt
    assert "The only solution-reveal exception is the required closing summary" in prompt


def test_tinyurl_closes_when_the_candidate_finishes_a_feasible_mvp() -> None:
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl_interview_prompt.md").prompt

    assert "Do not limit the interview to a fixed number of candidate responses" in prompt
    assert "Treat the TinyURL MVP as feasible" in prompt
    assert "Handling the read-heavy workload, usually through caching" in prompt
    assert '"That\'s how I would design it,"' in prompt
    assert "immediately begin the closing summary" in prompt
    assert "ask only one final focused question about that gap" in prompt
    assert "Is this how you would design TinyURL?" in prompt
    assert "Does that cover how you would design the MVP?" not in prompt
    assert "Only the candidate's speech can trigger this rule" in prompt
    assert "None of your own closing language can be treated as a completion cue" in prompt


def test_filename_does_not_determine_prompt_identity(tmp_path: Path) -> None:
    path = tmp_path / "anything at all.md"
    write_prompt(path, "id: explicit-prompt-id\ndisplay_name: Explicit Prompt")

    prompt = load_interview_prompt(path)

    assert prompt.prompt_id == "explicit-prompt-id"
    assert prompt.display_name == "Explicit Prompt"


def test_catalog_contains_all_packets_with_assigned_skill_levels() -> None:
    prompts = load_interview_prompts()

    assert set(prompts) == {
        "pastebin-system-design",
        "user-profile-api-system-design",
        "file-upload-service-system-design",
        "product-catalog-api-system-design",
        "webhook-ingestion-system-design",
        "tinyurl-system-design",
        "google-calendar-system-design",
        "hotel-booking-system-design",
        "notification-service-system-design",
        "api-rate-limiter-system-design",
        "distributed-key-value-store",
        "kafka-like-distributed-log",
        "google-analytics-system-design",
        "distributed-sql-database-system-design",
        "collaborative-documents-system-design",
    }
    assert {prompt.prompt_id: prompt.skill_level for prompt in prompts.values()} == {
        "pastebin-system-design": "Intern",
        "user-profile-api-system-design": "Intern",
        "file-upload-service-system-design": "Intern",
        "product-catalog-api-system-design": "Intern",
        "webhook-ingestion-system-design": "Intern",
        "tinyurl-system-design": "Junior",
        "google-calendar-system-design": "Junior",
        "hotel-booking-system-design": "Junior",
        "notification-service-system-design": "Junior",
        "api-rate-limiter-system-design": "Junior",
        "distributed-key-value-store": "Senior",
        "kafka-like-distributed-log": "Senior",
        "google-analytics-system-design": "Senior",
        "distributed-sql-database-system-design": "Senior",
        "collaborative-documents-system-design": "Senior",
    }
    assert {(prompt.skill_level, prompt.difficulty) for prompt in prompts.values()} == {
        ("Intern", "Beginner"),
        ("Junior", "Intermediate"),
        ("Senior", "Advanced"),
    }


@pytest.mark.parametrize(
    ("metadata", "body", "expected_error"),
    [
        ("display_name: Missing ID", "# Prompt\n", "missing required metadata field `id`"),
        ("id: missing-name", "# Prompt\n", "missing required metadata field `display_name`"),
        (
            "id: has-extra\ndisplay_name: Has Extra\ncategory: backend",
            "# Prompt\n",
            "unsupported metadata field `category`",
        ),
        (
            "id: Not Kebab Case\ndisplay_name: Invalid ID",
            "# Prompt\n",
            "must use kebab-case with lowercase letters and numbers",
        ),
        ("id: empty-body\ndisplay_name: Empty Body", "\n", "Markdown prompt body must not be empty"),
        ("id: [\ndisplay_name: Broken YAML", "# Prompt\n", "invalid YAML front matter"),
    ],
)
def test_invalid_prompt_reports_filename(
    tmp_path: Path,
    metadata: str,
    body: str,
    expected_error: str,
) -> None:
    path = tmp_path / "invalid_prompt.md"
    write_prompt(path, metadata, body)

    with pytest.raises(InterviewPromptValidationError) as exc_info:
        load_interview_prompts(tmp_path)

    message = str(exc_info.value)
    assert "invalid_prompt.md" in message
    assert expected_error in message


def test_missing_front_matter_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "missing_front_matter.md"
    path.write_text("# Prompt\n", encoding="utf-8")

    with pytest.raises(InterviewPromptValidationError, match="YAML front matter must start"):
        load_interview_prompts(tmp_path)


def test_duplicate_ids_list_every_conflicting_filename(tmp_path: Path) -> None:
    first = tmp_path / "first_name.md"
    second = tmp_path / "completely_different_name.md"
    metadata = "id: duplicate-id\ndisplay_name: Duplicate"
    write_prompt(first, metadata)
    write_prompt(second, metadata)

    with pytest.raises(InterviewPromptValidationError) as exc_info:
        load_interview_prompts(tmp_path)

    message = str(exc_info.value)
    assert 'duplicate interview prompt id "duplicate-id"' in message
    assert "first_name.md" in message
    assert "completely_different_name.md" in message


def test_unknown_prompt_lookup_is_clear() -> None:
    with pytest.raises(ValueError, match="Unknown interview prompt: missing-prompt"):
        get_interview_prompt("missing-prompt", {})


def test_elevenlabs_payload_uses_one_conversation_packet_variable() -> None:
    prompts = load_interview_prompts()
    payload = build_elevenlabs_agent_update_payload()
    agent = payload["conversation_config"]["agent"]

    assert LYRA_FIRST_MESSAGE == (
        "Hi, Taylor! I'm Lyra. Have you done a system design interview before?"
    )
    assert agent["first_message"] == LYRA_FIRST_MESSAGE
    assert agent["disable_first_message_interruptions"] is True
    assert agent["dynamic_variables"] == {
        "dynamic_variable_placeholders": {
            INTERVIEW_PACKET_DYNAMIC_VARIABLE: INTERVIEW_PACKET_PLACEHOLDER,
        }
    }
    dynamic_prompt = agent["prompt"]["prompt"]
    assert dynamic_prompt == build_dynamic_elevenlabs_prompt()
    assert "{{interview_packet}}" in dynamic_prompt
    for prompt in prompts.values():
        assert prompt.prompt.strip() not in dynamic_prompt
    assert payload["conversation_config"]["turn"] == {
        "turn_timeout": 15,
        "turn_eagerness": "normal",
    }
