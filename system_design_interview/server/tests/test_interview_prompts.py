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
from app.main import build_elevenlabs_agent_update_payload


def write_prompt(path: Path, metadata: str, body: str = "# Prompt\n\nInterview the candidate.\n") -> None:
    path.write_text(f"---\n{metadata}\n---\n{body}", encoding="utf-8")


def test_tinyurl_prompt_loads_markdown_body_without_rewriting_it() -> None:
    path = PROMPTS_DIR / "tinyurl_interview_prompt.md"
    source = path.read_text(encoding="utf-8")
    closing_front_matter = source.index("---\n", len("---\n"))
    expected_prompt = source[closing_front_matter + len("---\n") :]

    prompt = load_interview_prompt(path)

    assert prompt.prompt_id == DEFAULT_INTERVIEW_PROMPT_ID
    assert prompt.display_name == "TinyURL System Design"
    assert prompt.prompt == expected_prompt
    assert "design the backend for TinyURL" in prompt.prompt
    assert "# Private interviewer reference" in prompt.prompt
    assert "Never reveal or supply the solution" in prompt.prompt
    assert LYRA_FIRST_MESSAGE not in prompt.prompt


def test_filename_does_not_determine_prompt_identity(tmp_path: Path) -> None:
    path = tmp_path / "anything at all.md"
    write_prompt(path, "id: explicit-prompt-id\ndisplay_name: Explicit Prompt")

    prompt = load_interview_prompt(path)

    assert prompt.prompt_id == "explicit-prompt-id"
    assert prompt.display_name == "Explicit Prompt"


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


def test_elevenlabs_payload_uses_prompt_and_shared_interviewer_settings() -> None:
    prompt = get_interview_prompt()
    payload = build_elevenlabs_agent_update_payload(prompt)
    agent = payload["conversation_config"]["agent"]

    assert agent["first_message"] == LYRA_FIRST_MESSAGE
    assert agent["disable_first_message_interruptions"] is True
    assert agent["prompt"]["prompt"] == prompt.prompt
    assert payload["conversation_config"]["turn"] == {
        "turn_timeout": 15,
        "turn_eagerness": "normal",
    }
