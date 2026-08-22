from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).resolve().parent
SCENARIOS_DIR = PROMPTS_DIR / "scenarios"
EVALUATION_PROMPT_PATH = PROMPTS_DIR / "evaluate-turn.md"
SUGGESTION_PROMPT_PATH = PROMPTS_DIR / "suggest-response.md"
TRANSLATION_PROMPT_PATH = PROMPTS_DIR / "translate-transcript.md"
ELEVENLABS_POLICY_PATH = PROMPTS_DIR / "elevenlabs-conversation-policy.md"
REQUIRED_METADATA = {
    "display_name",
    "opening_message",
    "learner_role",
    "learner_goal",
    "guided_priorities",
}


@dataclass(frozen=True, slots=True)
class Scenario:
    scenario_id: str
    title: str
    opening_message: str
    learner_role: str
    learner_goal: str
    guided_priorities: tuple[str, ...]
    prompt: str


@dataclass(frozen=True, slots=True)
class Prompts:
    evaluation: str
    suggestion: str
    translation: str
    elevenlabs_policy: str
    scenarios: dict[str, Scenario]


class ScenarioPromptValidationError(ValueError):
    pass


def load_prompt(path: Path) -> str:
    try:
        prompt = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"Could not load prompt: {path}") from exc
    if not prompt:
        raise RuntimeError(f"Prompt must not be empty: {path}")
    return prompt


def load_scenario_prompt(path: Path) -> Scenario:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", path.stem):
        raise ValueError("filename must use lowercase kebab-case")
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValueError("could not read UTF-8 content") from exc
    if not lines or lines[0].strip() != "---":
        raise ValueError("YAML front matter must start on the first line")
    try:
        end = next(index for index, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration as exc:
        raise ValueError("YAML front matter is missing its closing ---") from exc
    try:
        metadata = yaml.safe_load("\n".join(lines[1:end]))
    except yaml.YAMLError as exc:
        raise ValueError("invalid YAML front matter") from exc
    if not isinstance(metadata, dict):
        raise ValueError("YAML front matter must be a mapping")
    missing = REQUIRED_METADATA - metadata.keys()
    extra = metadata.keys() - REQUIRED_METADATA
    if missing:
        raise ValueError(f"missing metadata field `{sorted(missing)[0]}`")
    if extra:
        raise ValueError(f"unsupported metadata field `{sorted(extra)[0]}`")
    for field in ("display_name", "opening_message", "learner_role", "learner_goal"):
        if not isinstance(metadata[field], str) or not metadata[field].strip():
            raise ValueError(f"invalid metadata field `{field}`")
    priorities = metadata["guided_priorities"]
    if not isinstance(priorities, list) or not 2 <= len(priorities) <= 6:
        raise ValueError("metadata field `guided_priorities` must contain 2 to 6 items")
    if any(not isinstance(priority, str) or not priority.strip() for priority in priorities):
        raise ValueError("metadata field `guided_priorities` must contain non-empty strings")
    normalized_priorities = tuple(priority.strip() for priority in priorities)
    if len({priority.casefold() for priority in normalized_priorities}) != len(normalized_priorities):
        raise ValueError("metadata field `guided_priorities` must not contain duplicates")
    prompt = "\n".join(lines[end + 1 :]).strip()
    if not prompt:
        raise ValueError("Markdown prompt body must not be empty")
    return Scenario(
        path.stem,
        metadata["display_name"].strip(),
        metadata["opening_message"].strip(),
        metadata["learner_role"].strip(),
        metadata["learner_goal"].strip(),
        normalized_priorities,
        prompt,
    )


def load_scenario_prompts(prompts_dir: Path = SCENARIOS_DIR) -> dict[str, Scenario]:
    paths = sorted(prompts_dir.glob("*.md"))
    if not paths:
        raise ScenarioPromptValidationError(f"{prompts_dir}: no Markdown scenario prompts found")
    scenarios: dict[str, Scenario] = {}
    for path in paths:
        try:
            scenario = load_scenario_prompt(path)
        except ValueError as exc:
            raise ScenarioPromptValidationError(f"{path.name}: {exc}") from exc
        scenarios[scenario.scenario_id] = scenario
    return scenarios


def load_prompts() -> Prompts:
    return Prompts(
        load_prompt(EVALUATION_PROMPT_PATH),
        load_prompt(SUGGESTION_PROMPT_PATH),
        load_prompt(TRANSLATION_PROMPT_PATH),
        load_prompt(ELEVENLABS_POLICY_PATH),
        load_scenario_prompts(),
    )
