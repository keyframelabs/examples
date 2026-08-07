from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import yaml

PROMPTS_DIR = Path(__file__).resolve().parent
SKILL_LEVELS = {"Beginner", "Intermediate", "Advanced"}
REQUIRED = {"display_name", "skill_level", "opening_message"}


@dataclass(frozen=True, slots=True)
class Scenario:
    scenario_id: str
    title: str
    skill_level: Literal["Beginner", "Intermediate", "Advanced"]
    opening_message: str
    prompt: str


class ScenarioPromptValidationError(ValueError):
    pass


def load_scenario_prompt(path: Path) -> Scenario:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", path.stem):
        raise ValueError("filename must use lowercase kebab-case")
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError("could not read UTF-8 content") from exc
    lines = source.splitlines()
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
    missing, extra = REQUIRED - metadata.keys(), metadata.keys() - REQUIRED
    if missing:
        raise ValueError(f"missing metadata field `{sorted(missing)[0]}`")
    if extra:
        raise ValueError(f"unsupported metadata field `{sorted(extra)[0]}`")
    if metadata["skill_level"] not in SKILL_LEVELS:
        raise ValueError("invalid metadata field `skill_level`")
    for field in ("display_name", "opening_message"):
        if not isinstance(metadata[field], str) or not metadata[field].strip():
            raise ValueError(f"invalid metadata field `{field}`")
    prompt = "\n".join(lines[end + 1 :]).strip()
    if not prompt:
        raise ValueError("Markdown prompt body must not be empty")
    return Scenario(
        path.stem,
        metadata["display_name"].strip(),
        cast(Literal["Beginner", "Intermediate", "Advanced"], metadata["skill_level"]),
        metadata["opening_message"].strip(),
        prompt,
    )


def load_scenario_prompts(prompts_dir: Path = PROMPTS_DIR) -> dict[str, Scenario]:
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
