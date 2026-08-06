# Keyframe Labs System Design Interview Demo

Practice system design interviews with an ElevenLabs voice agent, a Keyframe Labs avatar, and an infinite architecture canvas.

## Run locally

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js, and pnpm 11.9.0.

1. Create a Keyframe Labs API key and an ElevenLabs agent. Require authentication for the agent and scope its API key to the access needed to generate signed conversation URLs.
2. Configure the provider credentials:

   ```sh
   cp .env.example .env
   ```

   ```dotenv
   KEYFRAME_API_KEY=...
   ELEVENLABS_API_KEY=...
   ELEVENLABS_AGENT_ID=...
   ```

3. Install and start the app:

   ```sh
   uv sync
   pnpm install
   pnpm dev
   ```

Open `http://localhost:5174`. The API runs on `http://localhost:8788` by default.

### ElevenLabs agent setup

Configure the shared agent once in the ElevenLabs dashboard. The application does not modify persistent agent settings at startup or while users are interviewing.

- Set the first message to `Hi, I'm Lyra. Have you done a system design interview in the past?` and disable first-message interruptions.
- Set turn timeout to 15 seconds and turn eagerness to normal.
- Add the `interview_packet` dynamic variable with a safe placeholder such as `No interview packet was provided. Do not begin an interview.`
- Set the system prompt to:

  ```text
  # Selected interview packet

  The complete interview packet for this conversation appears inside `<interview_packet>`. Follow that packet as the authoritative interview instructions. Never mention dynamic variables or the packet wrapper to the candidate.

  <interview_packet>
  {{interview_packet}}
  </interview_packet>
  ```

Each session passes its selected packet as a conversation-scoped dynamic variable, so concurrent users do not overwrite one another's prompt.

## Use

Choose a skill level and interview packet, select **Begin interview**, and allow camera and microphone access. Talk through the design while adding services, databases, tables, text, and connections to the canvas; Lyra receives the current canvas as interview context. Use **Interview packets** to end the session and choose another prompt.

## Customize

- Add or edit interview packets in `server/app/interviews/prompts/`; follow the [prompt authoring guide](server/app/interviews/README.md).
- Change the avatar with `KEYFRAME_PERSONA_SLUG` in `.env`.
- Change colors and typography in `frontend/src/index.css`, or shared controls in `frontend/src/components/ui/`.
- Override the API port with `PORT=9000 pnpm dev`; set `CLIENT_ORIGIN` in `.env` if the frontend origin changes.
