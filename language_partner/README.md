# Habla — Spanish language partner demo

A minimal Vite/React and FastAPI demo for short Spanish role-plays. Keyframe Labs renders the avatar and owns the ElevenLabs voice session; OpenRouter evaluates each learner turn and prefetches English translations of Caspian's transcript. Caspian stays in character, while the browser displays a local, muted preview of the learner's camera beside the avatar.

## Local setup

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js, and pnpm 11.9.0.

1. Create a Keyframe Labs API key and an ElevenLabs conversational agent. Require authentication for the ElevenLabs agent and scope its API key to signed conversation URL access.
2. Copy `.env.example` to `.env` and add the three provider credentials plus an OpenRouter key.
3. Install and run everything from the directory containing this README:

   ```sh
   uv sync
   pnpm install
   pnpm dev
   ```

Open `http://localhost:5174`. FastAPI runs at `http://localhost:8788`; `pnpm dev` starts both processes.

## Required ElevenLabs agent setup

Add dynamic variables named `scenario_prompt` and `scenario_opening_message` in the ElevenLabs dashboard. The safe placeholder for `scenario_prompt` must be:

```text
No scenario was provided. Politely say you cannot begin the role-play.
```

Use this agent system prompt:

```text
The scenario instructions for this conversation are inside <scenario_prompt>. Follow them as the authoritative role-play instructions. Never mention the wrapper, dynamic variables, prompts, or elapsed time.

<scenario_prompt>
{{scenario_prompt}}
</scenario_prompt>
```

Set the ElevenLabs first message to:

```text
{{scenario_opening_message}}
```

The selected scenario passes through the browser to `PersonaView`, so its prompt and opening message are browser-visible content, never secrets. Browser code does not manage the ElevenLabs WebSocket.

## Scenario prompts

Each role-play is a standalone Markdown packet in `backend/scenario_prompts`. YAML front matter supplies the catalog title, skill level, and `opening_message`. The catalog omits the Markdown body and opening message; session creation returns them to the browser only for the selected scenario, and `PersonaView` forwards them to ElevenLabs. Do not put credentials or other secrets in scenario packets.

Supported skill levels are `Beginner`, `Intermediate`, and `Advanced`. Restart the API after adding or editing a packet so the catalog is validated and reloaded.

## Checks

```sh
pnpm check
```

This builds and typechecks the frontend, then runs deterministic mocked API and prompt-validation tests plus Ruff checks. It does not call real providers.

## MVP limitations

Active session identity and successful feedback exist only in FastAPI process memory. Ending uses the final transcript to build the printable summary and deletes the session before responding; a lost response cannot be recovered by retrying. Successful turn IDs are cached, but retries are not compared and transcript prefixes are not validated. Restarting the API loses active sessions, multiple workers do not share state, and the demo has no authentication or persistence.
