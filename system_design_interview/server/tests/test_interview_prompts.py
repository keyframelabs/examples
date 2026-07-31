from pathlib import Path

import pytest

from app.interviews.interview_loader import (
    DEFAULT_INTERVIEW_PROMPT_ID,
    PROMPTS_DIR,
    InterviewPromptValidationError,
    get_interview_prompt,
    load_interview_prompt,
    load_interview_prompts,
)

DEFAULT_METADATA = """display_name: Focused System Design
skill_level: Junior"""


def write_prompt(
    path: Path,
    metadata: str = DEFAULT_METADATA,
    body: str = "# Prompt\n\nInterview the candidate.\n",
) -> None:
    path.write_text(
        f"---\n{metadata}\n---\n{body}",
        encoding="utf-8",
    )


def test_tinyurl_prompt_loads_public_metadata_and_private_guidance() -> None:
    path = PROMPTS_DIR / "tinyurl-system-design.md"

    prompt = load_interview_prompt(path)

    assert prompt.prompt_id == DEFAULT_INTERVIEW_PROMPT_ID
    assert prompt.display_name == "TinyURL"
    assert prompt.skill_level == "Junior"
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


def test_tinyurl_opening_moves_directly_into_problem() -> None:
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl-system-design.md").prompt

    problem_transition = (
        "Not to worry. You'll lead the design on the canvas, and I'll ask a few "
        "follow-up questions as we go. So Let's dive right in! I want you to design TinyURL. "
        "Are you familiar with TinyURL?"
    )

    assert problem_transition in prompt
    assert "do not add any more explanation of the interview structure" in prompt
    assert "Do you need me to clarify anything?" in prompt
    assert "What requirements would you clarify before designing?" not in prompt
    assert "Do not ask what requirements the candidate would like to clarify" in prompt
    assert "then invite the candidate to clarify requirements" not in prompt


def test_tinyurl_sql_path_and_closing_are_explicit() -> None:
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl-system-design.md").prompt

    assert "let them completely finish that design" in prompt
    assert ("Reads significantly outweigh writes in this system. How would you adapt your design for that?") in prompt
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
    prompt = load_interview_prompt(PROMPTS_DIR / "tinyurl-system-design.md").prompt

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


def test_filename_stem_determines_prompt_identity(tmp_path: Path) -> None:
    path = tmp_path / "explicit-prompt-id.md"
    write_prompt(path, "display_name: Explicit Prompt\nskill_level: Intern")

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
    assert {prompt.source_path.stem for prompt in prompts.values()} == set(prompts)


def test_every_packet_uses_shared_formula_canvas_context_and_time_limit() -> None:
    prompts = load_interview_prompts()
    required_sections = (
        "# Personality",
        "# Environment",
        "## Canvas context",
        "# Goal",
        "# Interview flow",
        "## Opening",
        "## If the candidate is unfamiliar with the product",
        "## Candidate-led exploration and 10-minute pacing",
        "## Core/MVP completion and closing trigger",
        "## Answering candidate questions",
        "## Edge cases",
        "# Voice response style",
        "# Candidate-facing reference",
        "## Functional requirements",
        "## Non-functional requirements",
        "## Scale assumptions",
        "# Interviewer question bank",
        "## Clarifying questions",
        "## Topics to probe",
        "## Risk-focused probes",
        "## Examples of the allowed guidance boundary",
        "# Private interviewer reference",
        "## Possible solution families",
        "## Strong design direction",
        "# Evaluation and closing",
        "# Guardrails",
        "# Critical reminder",
    )
    environment_sections: set[str] = set()

    for packet in prompts.values():
        for section in required_sections:
            assert section in packet.prompt, f"{packet.prompt_id} is missing {section}"
        assert "hard 10-minute" in packet.prompt
        assert "Ask one focused question at a time" in packet.prompt
        assert "As time runs out, introduce no new topics" in packet.prompt
        assert "Never claim to see or know the UI clock" in packet.prompt

        environment = packet.prompt.split("# Environment\n", 1)[1].split("# Goal\n", 1)[0]
        environment_sections.add(environment)

    assert len(environment_sections) == 1


def test_tinyurl_only_content_is_not_copied_to_other_packets() -> None:
    prompts = load_interview_prompts()

    for prompt_id, packet in prompts.items():
        if prompt_id == DEFAULT_INTERVIEW_PROMPT_ID:
            continue
        assert "SQL-first path and caching probe" not in packet.prompt
        assert "Do you have any questions about utilizing NoSQL?" not in packet.prompt
        assert "TinyURL creates a new unique short URL" not in packet.prompt


@pytest.mark.parametrize(
    ("metadata", "body", "expected_error"),
    [
        ("skill_level: Junior", "# Prompt\n", "missing required metadata field `display_name`"),
        (
            'display_name: "   "\nskill_level: Junior',
            "# Prompt\n",
            "invalid metadata field `display_name`: must be a nonempty string",
        ),
        (
            "display_name:\n  - Invalid\nskill_level: Junior",
            "# Prompt\n",
            "invalid metadata field `display_name`",
        ),
        (
            "display_name: Missing Skill Level",
            "# Prompt\n",
            "missing required metadata field `skill_level`",
        ),
        (
            "display_name: Invalid Skill Level\nskill_level: Staff",
            "# Prompt\n",
            "invalid metadata field `skill_level`",
        ),
        (
            "display_name: Has Extra\nskill_level: Junior\nsummary: Not allowed",
            "# Prompt\n",
            "unsupported metadata field `summary`",
        ),
        (DEFAULT_METADATA, "\n", "Markdown prompt body must not be empty"),
        ("display_name: [\nskill_level: Junior", "# Prompt\n", "invalid YAML front matter"),
    ],
)
def test_invalid_prompt_reports_filename(
    tmp_path: Path,
    metadata: str,
    body: str,
    expected_error: str,
) -> None:
    path = tmp_path / "invalid-prompt.md"
    write_prompt(path, metadata, body)

    with pytest.raises(InterviewPromptValidationError) as exc_info:
        load_interview_prompts(tmp_path)

    message = str(exc_info.value)
    assert "invalid-prompt.md" in message
    assert expected_error in message


def test_invalid_filename_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "invalid_prompt.md"
    write_prompt(path)

    with pytest.raises(InterviewPromptValidationError) as exc_info:
        load_interview_prompts(tmp_path)

    message = str(exc_info.value)
    assert "invalid_prompt.md" in message
    assert "filename stem must use kebab-case with lowercase letters and numbers" in message


def test_missing_front_matter_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "missing-front-matter.md"
    path.write_text("# Prompt\n", encoding="utf-8")

    with pytest.raises(InterviewPromptValidationError, match="YAML front matter must start"):
        load_interview_prompts(tmp_path)


def test_duplicate_derived_ids_list_every_conflicting_filename(tmp_path: Path) -> None:
    path = tmp_path / "duplicate-id.md"
    write_prompt(path, "display_name: Duplicate\nskill_level: Junior")

    class DuplicatePromptDirectory:
        def glob(self, _pattern: str) -> list[Path]:
            return [path, path]

    with pytest.raises(InterviewPromptValidationError) as exc_info:
        load_interview_prompts(DuplicatePromptDirectory())  # type: ignore[arg-type]

    message = str(exc_info.value)
    assert 'duplicate interview prompt id "duplicate-id"' in message
    assert message.count("duplicate-id.md") == 2


def test_unknown_prompt_lookup_is_clear() -> None:
    with pytest.raises(ValueError, match="Unknown interview prompt: missing-prompt"):
        get_interview_prompt("missing-prompt", {})
