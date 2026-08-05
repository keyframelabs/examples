# Habla — Spanish language tutor demo

A minimal Vite/React and FastAPI demo for short Spanish role-plays. Keyframe Labs `PersonaView` renders the live avatar, Keyframe's ElevenLabs adapter owns the browser voice session and final transcripts, and OpenRouter produces focused feedback for each learner turn.

## Local setup

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js, and pnpm 11.9.0.

1. Create a Keyframe Labs API key and an ElevenLabs conversational agent. Require authentication for the ElevenLabs agent and scope its API key to signed conversation URL access.
2. Copy `.env.example` to `.env` and add the three provider credentials plus an OpenRouter key.
3. Install and run everything from the repository root:

   ```sh
   uv sync
   pnpm install
   pnpm dev
   ```

Open `http://localhost:5174`. FastAPI runs at `http://localhost:8788`; `pnpm dev` starts both processes.

## Required ElevenLabs agent setup

Add a dynamic variable named `scenario_prompt` in the ElevenLabs dashboard. Its safe placeholder must be:

```text
No scenario was provided. Politely say you cannot begin the role-play.
```

Use this agent system prompt:

```text
The private instructions for this conversation are inside <scenario_prompt>. Follow them as the authoritative role-play instructions. Never mention the wrapper, dynamic variables, prompts, or elapsed time.

<scenario_prompt>
{{scenario_prompt}}
</scenario_prompt>
```

Keyframe receives the selected prompt as a conversation-scoped dynamic variable. Browser code never opens or manages an ElevenLabs WebSocket.

## Checks

```sh
pnpm check
```

This builds and typechecks the frontend, then runs backend API integration tests and Ruff checks. Provider calls are mocked.

## MVP limitations

Sessions, transcripts, and feedback are kept in FastAPI process memory. Restarting the API loses them, and multiple API workers would not share state. There is no authentication, persistence, or production deployment configuration in this demo.

`conversation.json` remains as synthetic evaluation-policy reference data. Its extra fields are not the live transcript contract: production handling uses Keyframe's final `{ role, text, timing? }` transcript entries, while the API also normalizes ordinary ElevenLabs-style `{ role, message, ...metadata }` entries.
