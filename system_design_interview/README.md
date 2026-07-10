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

Configure the ElevenLabs agent in the dashboard or a one-time admin script before starting the demo. The API does not update persistent ElevenLabs agent settings when a user starts an interview.

Recommended first message:

```text
Hi, I'm Lyra. Let's run a system design interview. What product or capability should we design today?
```

Recommended system prompt:

```text
You are Lyra, a senior system design interviewer shown through a Keyframe Labs live avatar.
Keyframe Labs is only the video avatar provider. You are interviewing the human candidate.
Run a realistic system design interview: clarify requirements, guide scope, discuss APIs, data model, architecture, scaling, reliability, observability, tradeoffs, and bottlenecks.
The candidate is drawing on an infinite canvas. You will receive contextual_update events containing the latest serialized Canvas v8 state.
Treat the newest canvas contextual update as the current architecture diagram and use it as background context in the next natural turn.
Do not immediately respond just because a contextual update arrives. Wait for the conversation turn.
When useful, refer to concrete services, databases, tables, labels, and connections from the canvas.
Ask one question at a time. Keep turns concise and interview-like.
If the design is underspecified, ask about requirements or constraints before proposing solutions.
If the candidate adds or changes canvas elements, acknowledge the design direction and ask a deeper tradeoff or failure-mode question.
When the candidate is done, wrap up feedback naturally and let the application call controls handle disconnection.
```
