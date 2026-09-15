import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

DEFAULT_INTERVIEW_PROMPT_ID = "tinyurl-system-design"

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class InterviewPromptMetadata(BaseModel):
    display_name: str
    skill_level: Literal["Intern", "Junior", "Senior"]

    model_config = ConfigDict(extra="forbid")

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must be a nonempty string")
        return value.strip()


@dataclass(frozen=True)
class InterviewPrompt:
    prompt_id: str
    metadata: InterviewPromptMetadata
    prompt: str


class InterviewPromptValidationError(ValueError):
    """Raised when one or more interview prompt files are invalid."""


def load_interview_prompt(path: Path) -> InterviewPrompt:
    prompt_id = path.stem
    if not PROMPT_ID_PATTERN.fullmatch(prompt_id):
        raise ValueError("filename stem must use kebab-case with lowercase letters and numbers")

    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"could not read UTF-8 content: {exc}") from exc

    metadata_source, prompt = _split_front_matter(source)
    metadata = _parse_metadata(metadata_source)

    if not prompt.strip():
        raise ValueError("Markdown prompt body must not be empty")

    return InterviewPrompt(prompt_id=prompt_id, metadata=metadata, prompt=prompt)


def load_interview_prompts(prompts_dir: Path = PROMPTS_DIR) -> dict[str, InterviewPrompt]:
    paths = sorted(prompts_dir.glob("*.md"))
    prompts: dict[str, InterviewPrompt] = {}
    errors: list[str] = []

    if not paths:
        errors.append(f"{prompts_dir}: no Markdown interview prompts found")

    for path in paths:
        try:
            prompt = load_interview_prompt(path)
            prompts[prompt.prompt_id] = prompt
        except ValueError as exc:
            errors.append(f"{path.name}: {exc}")

    # The API falls back to this packet when a session request has no body, so it must exist.
    if not any(path.stem == DEFAULT_INTERVIEW_PROMPT_ID for path in paths):
        errors.append(f"{DEFAULT_INTERVIEW_PROMPT_ID}.md: default interview packet is missing")

    if errors:
        formatted_errors = "\n".join(f"- {error}" for error in errors)
        raise InterviewPromptValidationError(f"Interview prompt validation failed:\n{formatted_errors}")

    return prompts


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
        raw_metadata = yaml.safe_load(source)
    except yaml.YAMLError as exc:
        raise ValueError(f"invalid YAML front matter: {exc}") from exc

    if not isinstance(raw_metadata, dict):
        raise ValueError("YAML front matter must be a mapping")

    try:
        return InterviewPromptMetadata.model_validate(raw_metadata)
    except ValidationError as exc:
        messages = "; ".join(
            f"{'.'.join(str(part) for part in error['loc']) or 'metadata'}: {error['msg']}" for error in exc.errors()
        )
        raise ValueError(f"invalid metadata: {messages}") from exc


def main() -> None:
    prompts = load_interview_prompts()
    print(f"Validated {len(prompts)} interview prompt(s): {', '.join(prompts)}")


if __name__ == "__main__":
    main()
