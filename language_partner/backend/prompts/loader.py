from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).resolve().parent
SCENARIOS_DIR = PROMPTS_DIR / "scenarios"
EVALUATION_PROMPT_PATH = PROMPTS_DIR / "evaluate-turn.md"
SUGGESTION_PROMPT_PATH = PROMPTS_DIR / "suggest-response.md"
TRANSLATION_PROMPT_PATH = PROMPTS_DIR / "translate-transcript.md"
ELEVENLABS_POLICY_PATH = PROMPTS_DIR / "elevenlabs-conversation-policy.md"


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


def load_prompt(path: Path) -> str:
    try:
        prompt = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"Could not load prompt: {path}") from exc
    if not prompt:
        raise RuntimeError(f"Prompt must not be empty: {path}")
    return prompt


def load_scenario_prompt(path: Path) -> Scenario:
    _, front_matter, prompt = path.read_text(encoding="utf-8").split("---", 2)
    metadata = yaml.safe_load(front_matter)
    return Scenario(
        path.stem,
        metadata["display_name"],
        metadata["opening_message"],
        metadata["learner_role"],
        metadata["learner_goal"],
        tuple(metadata["guided_priorities"]),
        prompt.strip(),
    )


def load_scenario_prompts(prompts_dir: Path = SCENARIOS_DIR) -> dict[str, Scenario]:
    return {path.stem: load_scenario_prompt(path) for path in sorted(prompts_dir.glob("*.md"))}


def load_prompts() -> Prompts:
    return Prompts(
        load_prompt(EVALUATION_PROMPT_PATH),
        load_prompt(SUGGESTION_PROMPT_PATH),
        load_prompt(TRANSLATION_PROMPT_PATH),
        load_prompt(ELEVENLABS_POLICY_PATH),
        load_scenario_prompts(),
    )
