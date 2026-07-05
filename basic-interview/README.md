# Mock Interview Workspace

A local demo that shows how a live video interviewer can run a job-specific mock interview with interviewer-specific context, then generate a coaching artifact with a summary, strengths, gaps, and role-tailored resume bullets when a resume is supplied.

The app is built for a public repository: it keeps the file structure small, uses pnpm scripts from the repo root, and stores provider secrets only on the local backend.

## Tools Used

- Keyframe Labs self-managed live avatar with the Keyframe SDK
- ElevenLabs Agent for the live spoken interviewer
- OpenAI or Gemini backend LLM for interview planning, rubric creation, feedback, and resume coaching
- Vite, React, TypeScript, and shadcn-style UI components
- FastAPI backend with a TypeScript provider bridge
- Zustand and React Context for frontend interview-flow state
- Typst CLI for PDF feedback artifact generation
- pnpm workspace

## Run Locally In 5 Minutes

1. Enable pnpm through Corepack:

   ```bash
   corepack enable
   ```

2. Install dependencies:

   ```bash
   pnpm install
   python3 -m pip install -r server/requirements.txt
   ```

3. Install Typst for PDF feedback downloads:

   ```bash
   brew install typst
   typst --version
   ```

4. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

5. Fill in `.env` with your provider keys and IDs. OpenAI is the default LLM provider; set `LLM_PROVIDER=gemini` to use Gemini instead.

6. Start the app:

   ```bash
   pnpm dev
   ```

7. Open `http://localhost:5173`.

The frontend runs on `http://localhost:5173`. The backend API runs on `http://localhost:8787`.

## Repository Structure

```text
.
├── client/          # Vite React app, shadcn-style UI components, avatar stage, views
├── server/          # FastAPI app, provider bridge, uploads, prompts, in-memory store
├── shared/          # Shared Zod schemas, TypeScript types, text limits
├── .env.example     # One local configuration file to copy
├── package.json     # Root pnpm scripts
└── pnpm-workspace.yaml
```

The most common commands are run from the repo root:

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm dev` starts the FastAPI API through Uvicorn and the Vite client together. The FastAPI app stores active interviews in memory and calls `server/src/bridge.ts` for the existing TypeScript provider integrations.

## Get API Keys

### Keyframe Labs

1. Create or sign in to your Keyframe Labs account.
2. Open the Keyframe platform dashboard: `https://platform.keyframelabs.com`.
3. Create an API key and copy it into `.env`:

   ```bash
   KEYFRAME_API_KEY=kfl_sk_live_...
   ```

4. Choose a visible persona slug. The default is:

   ```bash
   KEYFRAME_PERSONA_SLUG=public:lyra_persona-1.5-live
   ```

Keyframe self-managed sessions are created by the backend through `POST https://api.keyframelabs.com/v1/sessions`. The browser receives only the ephemeral `server_url`, `participant_token`, and `agent_identity` returned by that API.

If you see `Persona not found or not visible`, the API key is working but the configured persona slug is not visible to that account or the server is still running with an old `.env` value. Use a persona slug from the Keyframe dashboard or a documented public persona, then restart `pnpm dev`.

Docs:

- API key guide: `https://docs.keyframelabs.com/guides/getting-started/get-your-api-key`
- Self-managed ElevenLabs guide: `https://docs.keyframelabs.com/guides/self-managed/agent-frameworks/elevenlabs-agents`
- JavaScript SDKs: `https://docs.keyframelabs.com/sdk-reference/javascript`

### ElevenLabs

1. Create or sign in to your ElevenLabs account.
2. Create a Conversational Agent.
3. Copy the agent ID into `.env`:

   ```bash
   ELEVENLABS_AGENT_ID=agent_...
   ```

4. Create an API key and copy it into `.env`:

   ```bash
   ELEVENLABS_API_KEY=...
   ```

5. Enable signed URL authentication for the agent.
6. In the agent's Security settings, make sure dynamic variables are allowed.

The backend updates the saved ElevenLabs agent for each generated interview by calling `PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}` with your `ELEVENLABS_API_KEY`. It sets the generated system prompt, the intro message, and `disable_first_message_interruptions: true`, then calls `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url`.

The frontend connects the signed ElevenLabs WebSocket to the Keyframe SDK avatar session. The browser sends `conversation_initiation_client_data` over that signed WebSocket so the live interviewer receives dynamic variables for the active candidate, role, job description, rubric, planned questions, and optional resume context. Provider API keys never go to the browser.

After the ElevenLabs WebSocket opens, the frontend also sends one concise `contextual_update` that reinforces the active candidate, target role, and mock interview flow. Large job-description and resume context should stay in dynamic variables and prompt context rather than repeated contextual updates.

Docs:

- Signed URLs: `https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url`
- Dynamic variables: `https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables`
- Contextual updates: `https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events#contextual-updates`
- Conversation details: `https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get`

### OpenAI

1. Create or sign in to your OpenAI account.
2. Open the API keys page in the OpenAI dashboard.
3. Create an API key and copy it into `.env`:

   ```bash
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5.5
   ```

The backend uses OpenAI structured outputs to create the initial interview rubric and the final feedback artifact. If `LLM_PROVIDER=openai` and `OPENAI_API_KEY` is empty, the app uses a local fallback rubric so you can still explore the upload flow.

Docs:

- Quickstart: `https://platform.openai.com/docs/quickstart`
- Structured outputs: `https://developers.openai.com/api/docs/guides/structured-outputs`

### Gemini

1. Create or sign in to Google AI Studio.
2. Create a Gemini API key.
3. Switch the LLM provider and copy the key into `.env`:

   ```bash
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-2.5-flash
   ```

The backend calls Gemini's `generateContent` API to create the same interview packet and feedback artifact schemas used by the OpenAI path. If `LLM_PROVIDER=gemini` and `GEMINI_API_KEY` is empty, the app uses the local fallback rubric.

Docs:

- Gemini API keys: `https://ai.google.dev/gemini-api/docs/api-key`
- Structured output: `https://ai.google.dev/gemini-api/docs/structured-output`

## Environment Variables

```bash
LLM_PROVIDER=openai

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com

KEYFRAME_API_KEY=
KEYFRAME_PERSONA_SLUG=public:lyra_persona-1.5-live

ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_API_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_PROMPT_DEBUG=false

PORT=8787
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
VITE_API_BASE_URL=http://localhost:8787

TYPST_BIN=typst
```

Never put provider API keys in `client/` or in `VITE_` variables. `VITE_API_BASE_URL` is safe because it only points the browser at the local backend. `CLIENT_ORIGIN` is comma-separated so Vite can still work if port `5173` is already in use and it moves to `5174`.

`LLM_PROVIDER` controls where the job description and optional resume are sent for rubric and feedback generation. Use `openai`, `gemini`, or `local-fallback`. The app does not send uploaded job or resume content to both OpenAI and Gemini unless you change the code to do that intentionally.

Set `ELEVENLABS_PROMPT_DEBUG=true` for local development when you need to inspect the exact ElevenLabs first message, generated system prompt, and `PATCH /v1/convai/agents/{agent_id}` payload. After you click **Start interview**, the Vite dev UI shows an **ElevenLabs prompt debug** panel below the live stage. Leave this disabled outside local debugging because the prompt can include job-description and resume excerpts.

`TYPST_BIN` points to the Typst executable used by the backend to compile the PDF feedback artifact. Leave it as `typst` when the CLI is on your PATH.

## Local Walkthrough

1. Start the app with `pnpm dev`.
2. Paste a job description.
3. Optionally upload a resume. Supported files are `.txt`, `.pdf`, and `.docx`.
4. Click **Create interview**.
5. Click **Start interview** and allow microphone access.
6. Complete the mock interview.
7. Let the interviewer end the call after coaching.
8. Click **Generate summary** to fetch the transcript and create the coaching artifact.
9. Click **Download PDF** on the feedback page to generate the Typst-formatted summary artifact.

The interview flow is designed to:

- introduce the interviewer
- explain the mock interview and coaching session
- describe the target position
- ask about relevant field experience
- ask two role-aligned experience questions
- ask for hard-skill and soft-skill examples
- briefly summarize each main answer and ask one job-description-related clarifying follow-up
- handle clarification interruptions with one job-related follow-up
- thank the candidate and provide coaching with one strength and two improvements
- ask the candidate to try a revised answer or stronger example for each improvement
- tell the candidate to click **Generate summary**, then end the call
- suggest role-tailored resume bullets when a resume was supplied

## ElevenLabs Agent Configuration

Confirm the ElevenLabs Agent has the `end_call` system tool enabled. No manual system-prompt paste is required for normal local use.

When you click **Start interview**, the backend uses `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` to update the saved ElevenLabs Agent with:

- the generated interviewer system prompt
- the generated intro message from the interview packet
- `disable_first_message_interruptions: true`

After that update succeeds, the backend creates the signed URL used by the browser. This keeps prompt setup on the server and avoids requiring prompt or first-message override permissions in the ElevenLabs Agent security settings.

For local prompt inspection, set `ELEVENLABS_PROMPT_DEBUG=true` before starting `pnpm dev`. The browser will show the first message, full system prompt, and exact agent update payload after a live session is prepared.

## Troubleshooting

- **Missing env var**: update `.env`, stop `pnpm dev`, and restart it.
- **Microphone blocked**: allow microphone access for `http://localhost:5173` in the browser.
- **Unsupported file**: use `.txt`, `.pdf`, or `.docx`.
- **Keyframe session failed**: check `KEYFRAME_API_KEY` and `KEYFRAME_PERSONA_SLUG`. `Persona not found or not visible` means the slug is not visible to that API key, or the backend needs a restart after changing `.env`.
- **ElevenLabs signed URL failed**: check `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and signed URL authentication.
- **ElevenLabs says the wrong opening line or prompt**: confirm `ELEVENLABS_API_KEY` has permission to update the configured agent, then restart the app and create a fresh interview so the backend can patch the agent before the signed URL is created.
- **Call does not end automatically**: confirm the ElevenLabs Agent has the `end_call` system tool enabled and that the system prompt tells the agent to use it after coaching.
- **Transcript unavailable**: wait a few seconds after the session ends and generate the artifact again.
- **PDF download fails**: install Typst, confirm `typst --version` works, or set `TYPST_BIN` to the executable path and restart `pnpm dev`.
- **OpenAI error**: verify `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, model access, and billing status.
- **Gemini error**: verify `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, model access, and API quota.
- **Unexpected local fallback**: check that `LLM_PROVIDER` matches the key you added, then restart `pnpm dev`.

## Development Notes

- `server/app/main.py` contains the FastAPI API, CORS setup, upload handling, and in-memory interview storage.
- `server/src/bridge.ts` connects FastAPI requests to the TypeScript provider and artifact code.
- `server/src/lib/keyframe.ts` contains the Keyframe session call.
- `server/src/lib/elevenlabs.ts` contains signed URL and transcript lookup calls.
- `server/src/lib/llm.ts` chooses OpenAI, Gemini, or the local fallback.
- `server/src/lib/openai.ts` contains the OpenAI rubric and feedback adapter.
- `server/src/lib/gemini.ts` contains the Gemini rubric and feedback adapter.
- `server/src/lib/feedback-pdf.ts` contains the Typst PDF feedback renderer.
- `server/src/lib/prompts.ts` contains the interviewer and coaching instructions.
- `client/src/lib/interview-store.ts` contains the Zustand interview-flow store.
- `client/src/components/InterviewStoreProvider.tsx` provides the store instance through React Context.
- `shared/src/schemas.ts` defines the API contracts used by both frontend and backend.

This demo uses in-memory storage only. Restarting the server clears interviews and feedback artifacts.
