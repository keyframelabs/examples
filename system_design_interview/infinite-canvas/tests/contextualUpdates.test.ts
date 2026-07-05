import { describe, expect, it, vi } from "vitest";

import { createContextualUpdateAdapter } from "../src/integration/contextualUpdates";
import type {
  CanvasConnectionCardinality,
  CanvasElement,
  CanvasState
} from "../src/canvas/model/types";

describe("createContextualUpdateAdapter", () => {
  it("sends serialized canvas context through the injected sender", async () => {
    const sent: string[] = [];
    const adapter = createContextualUpdateAdapter((text) => {
      sent.push(text);
    });

    const first = state("API Gateway");
    await expect(adapter.flush(first)).resolves.toBe(true);

    expect(sent).toEqual([
      [
        "Canvas v8",
        "Nodes:",
        "service api: API Gateway"
      ].join("\n")
    ]);

    await expect(adapter.flush(first)).resolves.toBe(false);

    const second = state("Edge API");
    await expect(adapter.flush(second)).resolves.toBe(true);

    expect(sent[sent.length - 1]).toBe(
      [
        "Canvas v8",
        "Nodes:",
        "service api: Edge API"
      ].join("\n")
    );
  });

  it("flushes the latest pushed state on the interval", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const adapter = createContextualUpdateAdapter((text) => {
      sent.push(text);
    }, { intervalMs: 5000 });

    adapter.push(state("API Gateway"));
    adapter.start();
    await vi.advanceTimersByTimeAsync(5000);
    adapter.stop();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("service api: API Gateway");
    vi.useRealTimers();
  });

  it("dedupes on serialized context while still sending relationship changes", async () => {
    const sent: string[] = [];
    const adapter = createContextualUpdateAdapter((text) => {
      sent.push(text);
    });

    const first = relationshipState("one-to-one");
    await expect(adapter.flush(first)).resolves.toBe(true);

    const movedOnly = {
      ...first,
      elements: {
        ...first.elements,
        users: {
          ...first.elements.users,
          x: 48
        }
      }
    };
    await expect(adapter.flush(movedOnly)).resolves.toBe(false);

    await expect(adapter.flush(relationshipState("one-to-many"))).resolves.toBe(true);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("users.id -> events.user_id [1:1]");
    expect(sent[1]).toContain("users.id -> events.user_id [1:N]");
  });
});

function state(label: string): CanvasState {
  return {
    version: 8,
    selectedIds: [],
    order: ["api"],
    elements: {
      api: {
        id: "api",
        kind: "service",
        x: 0,
        y: 0,
        width: 180,
        height: 96,
        label,
        alias: "api"
      }
    }
  };
}

function relationshipState(
  cardinality: CanvasConnectionCardinality
): CanvasState {
  const elements: CanvasElement[] = [
    {
      id: "users",
      kind: "table",
      x: 0,
      y: 0,
      width: 210,
      height: 150,
      label: "users",
      fields: [
        { id: "id", text: "id pk" },
        { id: "email", text: "email" }
      ]
    },
    {
      id: "events",
      kind: "table",
      x: 280,
      y: 0,
      width: 210,
      height: 150,
      label: "events",
      fields: [
        { id: "id", text: "id pk" },
        { id: "user_id", text: "user_id fk" }
      ]
    },
    {
      id: "users-events",
      kind: "connection",
      fromId: "users",
      toId: "events",
      fromFieldId: "id",
      toFieldId: "user_id",
      cardinality,
      label: "events"
    }
  ];

  return {
    version: 8,
    selectedIds: [],
    order: elements.map((element) => element.id),
    elements: Object.fromEntries(
      elements.map((element) => [element.id, element])
    ) as Record<string, CanvasElement>
  };
}
