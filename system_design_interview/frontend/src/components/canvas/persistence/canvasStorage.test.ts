import { describe, expect, it } from "vitest";

import {
  CANVAS_STORAGE_KEY,
  loadCanvasState,
  saveCanvasState,
  type CanvasStorage
} from "@/components/canvas/persistence/canvasStorage";
import {
  canvasReducer,
  createEmptyCanvasState,
  createNode
} from "@/components/canvas/model/state";

describe("canvas persistence", () => {
  it("round-trips inline labels and key metadata", () => {
    const table = createNode("table", 0, 0, {
      id: "accounts",
      label: "accounts",
      fields: [
        {
          id: "account_id",
          text: "account_id",
          primaryKey: true,
          foreignKey: true
        }
      ]
    });
    const state = canvasReducer(createEmptyCanvasState(), {
      type: "add-node",
      node: table,
      select: false
    });
    const storage = memoryStorage();

    saveCanvasState(storage, state);

    expect(loadCanvasState(storage, createEmptyCanvasState())).toEqual(state);
  });

  it("falls back when stored data is invalid or from an old schema", () => {
    const fallback = createEmptyCanvasState();
    const storage = memoryStorage();
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ version: 8 }));

    expect(loadCanvasState(storage, fallback)).toBe(fallback);
    storage.setItem(CANVAS_STORAGE_KEY, "not-json");
    expect(loadCanvasState(storage, fallback)).toBe(fallback);
  });
});

function memoryStorage(): CanvasStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}
