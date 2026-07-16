from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

DEFAULT_INTERVIEW_PROMPT_ID = "tinyurl-system-design"
DEFAULT_TURN_TIMEOUT_SECONDS = 15
DEFAULT_TURN_EAGERNESS = "normal"
LYRA_FIRST_MESSAGE = "Hi, my name is Lyra and I'll be conducting your system design interview today. How was your day?"

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True)
class InterviewPrompt:
    prompt_id: str
    display_name: str
    prompt: str
    source_path: Path


class InterviewPromptMetadata(BaseModel):
    id: str = Field(strict=True)
    display_name: str = Field(strict=True)

    model_config = ConfigDict(extra="forbid")

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not value or value != value.strip():
            raise ValueError("must be a nonempty string without surrounding whitespace")
        if not PROMPT_ID_PATTERN.fullmatch(value):
            raise ValueError("must use kebab-case with lowercase letters and numbers")
        return value

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must be a nonempty string")
        return value.strip()


class InterviewPromptValidationError(ValueError):
    """Raised when one or more interview prompt files are invalid."""


def load_interview_prompt(path: Path) -> InterviewPrompt:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"could not read UTF-8 content: {exc}") from exc

    metadata_source, prompt = _split_front_matter(source)
    metadata = _parse_metadata(metadata_source)

    if not prompt.strip():
        raise ValueError("Markdown prompt body must not be empty")

    return InterviewPrompt(
        prompt_id=metadata.id,
        display_name=metadata.display_name,
        prompt=prompt,
        source_path=path,
    )


def load_interview_prompts(prompts_dir: Path = PROMPTS_DIR) -> dict[str, InterviewPrompt]:
    paths = sorted(prompts_dir.glob("*.md"))
    prompts: list[InterviewPrompt] = []
    errors: list[str] = []

    if not paths:
        errors.append(f"{prompts_dir}: no Markdown interview prompts found")

    for path in paths:
        try:
            prompts.append(load_interview_prompt(path))
        except ValueError as exc:
            errors.append(f"{path.name}: {exc}")

    prompts_by_id: dict[str, list[InterviewPrompt]] = {}
    for prompt in prompts:
        prompts_by_id.setdefault(prompt.prompt_id, []).append(prompt)

    for prompt_id, duplicates in sorted(prompts_by_id.items()):
        if len(duplicates) > 1:
            filenames = ", ".join(prompt.source_path.name for prompt in duplicates)
            errors.append(f'duplicate interview prompt id "{prompt_id}": {filenames}')

    if errors:
        formatted_errors = "\n".join(f"- {error}" for error in errors)
        raise InterviewPromptValidationError(f"Interview prompt validation failed:\n{formatted_errors}")

    return {prompt.prompt_id: prompt for prompt in prompts}


def get_interview_prompt(
    prompt_id: str = DEFAULT_INTERVIEW_PROMPT_ID,
    prompts: dict[str, InterviewPrompt] | None = None,
) -> InterviewPrompt:
    loaded_prompts = prompts if prompts is not None else load_interview_prompts()
    try:
        return loaded_prompts[prompt_id]
    except KeyError as exc:
        raise ValueError(f"Unknown interview prompt: {prompt_id}") from exc


def _split_front_matter(source: str) -> tuple[str, str]:
    lines = source.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ValueError("YAML front matter must start on the first line with ---")

    closing_index = next(
        (index for index, line in enumerate(lines[1:], start=1) if line.strip() == "---"),
        None,
    )
    if closing_index is None:
        raise ValueError("YAML front matter is missing its closing ---")

    return "".join(lines[1:closing_index]), "".join(lines[closing_index + 1 :])


def _parse_metadata(source: str) -> InterviewPromptMetadata:
    try:
        raw_metadata: Any = yaml.safe_load(source)
    except yaml.YAMLError as exc:
        raise ValueError(f"invalid YAML front matter: {exc}") from exc

    if not isinstance(raw_metadata, dict):
        raise ValueError("YAML front matter must be a mapping")

    try:
        return InterviewPromptMetadata.model_validate(raw_metadata)
    except ValidationError as exc:
        messages = [_format_metadata_error(error) for error in exc.errors()]
        raise ValueError("; ".join(messages)) from exc


def _format_metadata_error(error: dict[str, Any]) -> str:
    field = ".".join(str(part) for part in error["loc"])
    error_type = error["type"]
    if error_type == "missing":
        return f"missing required metadata field `{field}`"
    if error_type == "extra_forbidden":
        return f"unsupported metadata field `{field}`"

    message = error["msg"].removeprefix("Value error, ")
    return f"invalid metadata field `{field}`: {message}"


def main() -> None:
    prompts = load_interview_prompts()
    get_interview_prompt(DEFAULT_INTERVIEW_PROMPT_ID, prompts)
    filenames = ", ".join(prompt.source_path.name for prompt in prompts.values())
    print(f"Validated {len(prompts)} interview prompt(s): {filenames}")


if __name__ == "__main__":
    main()
