import { describe, expect, it } from "vitest";

import { createCanvasSessionDefaults } from "@/components/canvas/model/interviewCanvasTemplates";
import { CANVAS_SCHEMA_VERSION } from "@/components/canvas/model/types";

describe("interview canvas defaults", () => {
  it("starts every interview with fresh empty canvas state", () => {
    const first = createCanvasSessionDefaults();
    const second = createCanvasSessionDefaults();

    expect(first).toEqual({
      initialState: {
        version: CANVAS_SCHEMA_VERSION,
        elements: {},
        order: [],
        selectedIds: []
      },
      canvasText: `Canvas v${CANVAS_SCHEMA_VERSION}`
    });
    expect(second).toEqual(first);
    expect(second.initialState).not.toBe(first.initialState);
  });
});
