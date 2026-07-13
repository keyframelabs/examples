# Keyframe Labs System Design Interview Demo

This demo pairs an infinite system design canvas with a floating Keyframe Labs avatar interviewer powered by ElevenLabs.

## Structure

- `frontend/` owns the system design interview UI, including the canvas, avatar, and app-owned shadcn components.
- `server/` creates Keyframe sessions and ElevenLabs signed URLs without exposing provider secrets to the browser.

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

Each interview packet uses its own preconfigured ElevenLabs agent. Map packet IDs to agent IDs in `.env`:

```dotenv
ELEVENLABS_AGENT_IDS={"tinyurl-system-design":"agent_..."}
```

This mapping connects an interview packet ID to the dedicated ElevenLabs agent that stores that problem's prompt. The
backend uses it both to synchronize the correct agent during startup and to select that agent when an interview begins.
Keeping the mapping in `.env` allows development, staging, and production to use different agent IDs without changing
application code.

For multiple problems, add one mapping entry per packet:

```dotenv
ELEVENLABS_AGENT_IDS={"tinyurl-system-design":"agent_tinyurl","chat-system-design":"agent_chat"}
```

`ELEVENLABS_AGENT_ID` remains an optional backwards-compatible fallback for the default TinyURL packet.

Backend startup synchronizes every registered packet's prompt, first message, and turn settings before accepting
requests. Changing a packet and restarting the backend therefore updates its persistent ElevenLabs agent. Session
creation itself only requests provider credentials and never updates agent configuration.
Startup synchronization is always enabled so the backend cannot serve an interview with stale agent configuration.

The standalone sync command remains available for deployments where you want to update agents without restarting the
backend:

```sh
uv run python -m server.app.sync_elevenlabs_agents
```

Pass one or more packet IDs to sync only those packets:

```sh
uv run python -m server.app.sync_elevenlabs_agents tinyurl-system-design
```

The shared hierarchical prompt renderer and problem definitions live in
`server/app/interview_packets.py`. Each packet includes `turn_timeout_seconds` and `turn_eagerness`; the sync command
and automatic startup sync write them to `conversation_config.turn.turn_timeout` and
`conversation_config.turn.turn_eagerness`. These are
ElevenLabs agent settings, not tool calls, so they do not require KFL SDK support.

To add another problem:

1. Define its `SystemDesignProblem` and `InterviewPacket` and register the packet in `INTERVIEW_PACKETS`.
2. Create a dedicated ElevenLabs agent for it.
3. Add the packet-to-agent mapping to `ELEVENLABS_AGENT_IDS`.
4. Restart the backend, or run the standalone sync command.

The application handles call disconnection. The prompt intentionally does not reference ElevenLabs `end_call` because
that system tool is not currently exposed by the KFL SDK integration.

The installed KFL Elements integration also does not yet forward ElevenLabs `conversation_initiation_client_data`.
When that support is available, candidate-visible details can move to per-conversation dynamic variables. Keep private
solution references on the dedicated agent so they are not exposed in browser traffic. If the packet catalog grows large
enough that dedicated agents become impractical, use a server-side ElevenLabs relay or custom LLM path for private
per-session context.
