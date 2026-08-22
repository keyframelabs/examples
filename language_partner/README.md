# Keyframe Labs Spanish Language Partner

A Spanish language partner that matches your skill level and drops you straight into realistic situations.

## Features

- Lifelike Spanish conversation partner powered by Keyframe Labs' human foundation models
- Real-time voice conversations powered by an ElevenLabs agent
- Guided mode with suggested responses and word-by-word karaoke highlighting, plus Freestyle mode for open conversation
- Bilingual conversation transcripts, learner feedback, and a printable session summary

## Getting started

1. Create a Keyframe Labs API key.
2. Create an OpenRouter API key.
3. Create an ElevenLabs conversational agent. Require authentication and scope its API key to signed conversation URL access.
4. Copy the environment template and configure the provider credentials and models:

   ```sh
   cp .env.example .env
   ```

   Use a small, fast model for `OPENROUTER_GUIDED_MODEL` and a larger, fast model for `OPENROUTER_UTILITY_MODEL`. Prioritize low latency and high tokens per second; both must support [strict structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

5. Install and start the app:

   ```sh
   uv sync
   pnpm install
   pnpm dev
   ```

Open `http://localhost:5174`.

### ElevenLabs agent setup

In the ElevenLabs dashboard, set **System prompt** to:

```text
{{scenario_prompt}}
```

Set **Opening message** to:

```text
{{scenario_opening_message}}
```

Enable the ElevenLabs `end_call` system tool. The app supplies both variables when each conversation begins.

## Customize

- Add or edit role-play packets in `backend/prompts/scenarios/`.
- Change the avatar with `KEYFRAME_PERSONA_SLUG` in `.env`.
- Change the Guided and utility models with `OPENROUTER_GUIDED_MODEL` and `OPENROUTER_UTILITY_MODEL`.

## Learn more

- [Documentation](https://docs.keyframelabs.com/)
- [Platform](https://platform.keyframelabs.com)
- [Website](https://www.keyframelabs.com/)
