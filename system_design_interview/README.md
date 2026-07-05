# Keyframe Labs System Design Interview Demo

This demo pairs the reusable infinite canvas with a floating Keyframe Labs avatar interviewer powered by ElevenLabs.

## Structure

- `client/` owns the system design interview UI.
- `server/` creates Keyframe sessions and ElevenLabs signed URLs without exposing provider secrets to the browser.
- `infinite-canvas/` remains a standalone, testable canvas package that exports the canvas, serializer, types, and contextual-update adapter.

## Run

1. Copy `.env.example` to `.env` and fill in the provider keys.
2. Install dependencies with `pnpm install`.
3. Start the app with `pnpm dev`.

The client runs on `http://localhost:5174` and the API runs on `http://localhost:8788` by default.
