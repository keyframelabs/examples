# KFL System Design Canvas

A Vite/React canvas for sketching lightweight system designs and serializing the current diagram into compact text for downstream assistants.

## Setup

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Tech Stack

- Package manager: pnpm 11
- App runtime: React 18 with TypeScript
- Build tool/dev server: Vite 6
- UI layer: local shadcn-style React primitives in `src/components/ui`
- Styling engine: Tailwind CSS 3 with plain CSS globals
- Icons: lucide-react
- Canvas rendering: SVG plus HTML `foreignObject` overlays for wrapped/editable text
- State: deterministic reducer-based canvas model in plain TypeScript
- LLM export: compact text serializer, not raw JSON
- Tests: Vitest for serializer and state-model coverage
- Integration boundary: framework-neutral contextual update adapter for future KFL/ElevenLabs wiring

## MVP Features

- Infinite-feeling canvas with wheel panning, zoom controls, and background drag panning.
- Tool palette for select/move, service boxes, database cylinders, database tables, text labels, and cardinality-aware connectors.
- Direct selection, dragging, delete, undo/redo, inline editing, and resize handles.
- Wrapped text inside shapes and table cells so longer labels stay within their bounds.
- Schema-backed canvas state with actors, services, databases, tables, text labels, and connections.
- Reducer helpers for creating, selecting, moving, resizing, and deleting canvas elements.
- Table metadata support through optional table types and simple field lists with connectable field/key rows.
- Text serialization via `serializeCanvasToText` for model-readable context.
- Framework-neutral contextual update adapter for periodic compact state updates.

## Basic Use

- Select a shape and drag it to move it.
- Click directly into shape text, labels, or table rows to edit their text.
- Drag the lower-right handle of a selected shape to resize it.
- Use the connector tool by choosing `1:1`, `1:N`, `N:1`, or `N:N`, then clicking visible attachment points on a source and target.
- Drag a selected connection endpoint to reattach it to another visible attachment point.
- Regular connections render as arrows; table-to-table endpoints use one/many crow's-foot markers.
- Table-to-table relationships do not display or export labels.
- Use the inspector to edit labels, table fields, dimensions, or delete the selected item.

## Architecture Notes

- `src/canvas/model/types.ts` defines the portable canvas schema and exported TypeScript types.
- `src/canvas/model/state.ts` owns reducer behavior and creation helpers.
- `src/canvas/serializer/serializeCanvas.ts` converts a `CanvasState` into compact text.
- `src/integration/contextualUpdates.ts` schedules serialized state updates and accepts any async sender callback.
- Integration code should keep transport, auth, and product-specific SDK calls outside the canvas package.

## KFL Future Integration

- Treat canvas text as a `contextual_update` payload, not as chat history.
- Push the latest `CanvasState` into the adapter after canvas mutations.
- Start the adapter when a live KFL session begins and stop it when the session ends.
- Call `flush(state)` before turn boundaries or handoffs so KFL receives the latest diagram state immediately.
- Keep ElevenLabs, Keyframe, and KFL SDK details in their own integration layer.

## `contextual_update` Example Flow

```ts
import { createContextualUpdateAdapter } from "./src/integration/contextualUpdates";

const updates = createContextualUpdateAdapter(async (text) => {
  await sendToKfl({
    type: "contextual_update",
    text
  });
});

updates.start();
updates.push(canvasState);

// Before a model turn or session handoff:
await updates.flush(canvasState);

updates.stop();
```

The adapter defaults to about 7 seconds between scheduled updates, clamps custom intervals to the 5-10 second range, and skips identical serialized text.
