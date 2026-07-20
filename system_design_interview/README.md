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

## ElevenLabs agent setup

Use a single ElevenLabs agent across all interview packets. The persistent agent prompt contains one
`{{interview_packet}}` dynamic-variable placeholder and never embeds the complete packet library. When a user begins an
interview, the server returns only the selected packet body and the browser supplies it to that conversation.

### Portal setup

1. Under Agent Security, enable signed-URL authentication. ElevenLabs requires choosing signed URLs or a hostname
   allowlist, not both.
2. System Prompt overrides are not used and can remain disabled. Dynamic variables do not require that override.
3. Ensure `ELEVENLABS_API_KEY` can update Agents, then configure the agent in `.env`:

```dotenv
ELEVENLABS_AGENT_ID=agent_...
```

Startup validates every Markdown packet, then updates the persistent agent configuration with the generic prompt,
opening message, turn settings, and an `interview_packet` placeholder. No portal prompt editing is required after that
sync. See the [dynamic variables guide](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables),
[authentication guide](https://elevenlabs.io/docs/eleven-agents/customization/authentication), and
[signed URL API](https://elevenlabs.io/docs/api-reference/conversations/get-signed-url) for the provider details.

For this MVP, the complete selected packet is intentionally present in the browser's session response and ElevenLabs
conversation-initiation message. A user can inspect it. The isolation guarantee is that exactly one selected packet is
sent to a conversation; unselected packets are never included in the persistent agent prompt or that session payload.

Interview prompts live in `server/app/interviews/prompts/`. See the concise
[authoring guide](server/app/interviews/README.md) or validate all prompts with:

```sh
pnpm interview:validate
```

The application handles call disconnection. The prompt intentionally does not reference ElevenLabs `end_call` because
that system tool is not currently exposed by the KFL SDK integration.

Interview selection starts a new conversation with the selected packet fixed in the `interview_packet` dynamic
variable. Multiple interviews safely reuse the same generic agent because session creation never mutates its persistent
configuration.
