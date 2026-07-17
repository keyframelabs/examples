# Keyframe Labs System Design Interview Demo

This demo pairs an infinite system design canvas with a floating Keyframe Labs avatar interviewer powered by ElevenLabs.

## Structure

- `frontend/` owns the system design interview UI, including the canvas, avatar, and app-owned shadcn components.
- `server/` creates Keyframe sessions and ElevenLabs signed URLs without exposing provider secrets to the browser.

The canvas uses the free, MIT-licensed `@xyflow/react` core package. It does not
depend on React Flow Pro packages or paid examples.

## Run

1. Copy `.env.example` to `.env` and fill in the provider keys.
2. Install `uv`.
3. Install Python 3.12 and Python dependencies with `uv sync`.
4. Install JavaScript dependencies with `pnpm install`.
5. Start the app with `pnpm dev`.

The frontend runs on `http://localhost:5174` and the API runs on `http://localhost:8788` by default.

Python commands run through `uv run`, which uses the repo `.python-version` file.

## Shadcn components

`frontend/components.json` is the only shadcn configuration. Component source lives in
`frontend/src/components/ui`, `cn()` lives in `frontend/src/lib/utils.ts`, and global
theme variables and Tailwind layers live in `frontend/src/index.css`.

Edit `frontend/src/components/ui/*.tsx` to change shared component defaults. Customize
individual instances with `className`, `variant`, and `size` where the component supports
them.

Add a component from the repository root with:

```sh
pnpm --dir frontend dlx shadcn@latest add <component>
```

Do not overwrite an existing customized component without reviewing the resulting diff.

`PROVIDER_TIMEOUT_SECONDS` controls the timeout for Keyframe session creation and ElevenLabs signed URL requests.

## ElevenLabs Agent Setup

Configure the shared ElevenLabs agent in `.env`:

```dotenv
ELEVENLABS_AGENT_ID=agent_...
```

Startup validates every Markdown interview prompt, then synchronizes one shared packet library and opening message to
this agent before accepting requests. Session creation does not mutate the persistent agent configuration. Instead, it
passes the selected public packet ID as the `interview_packet_id` dynamic variable when the ElevenLabs WebSocket starts.
The shared agent follows only the matching packet, so all interviews use the same agent without branch configuration.

Interview prompts live in `server/app/interviews/prompts/`. See the concise
[authoring guide](server/app/interviews/README.md) or validate all prompts with:

```sh
pnpm interview:validate
```

The application handles call disconnection. The prompt intentionally does not reference ElevenLabs `end_call` because
that system tool is not currently exposed by the KFL SDK integration.

Interview selection starts a new conversation with its packet ID fixed in the initiation data. Multiple interviews can
safely reuse the shared agent without mutating shared configuration during session creation.
