import { describe, expect, it } from "vitest";

import { isMeaningfulCanvasAction } from "@/components/canvas/hooks/useCanvasHistory";
import type { CanvasAction } from "@/components/canvas/model/state";

const expectedMeaningByActionType: Record<CanvasAction["type"], boolean> = {
  "add-node": true,
  "add-connection": true,
  "update-element": true,
  "update-node-geometries": true,
  "remove-table-field": true,
  "delete-elements": true,
  "settle-collisions": true,
  "change-selection": false,
  select: false,
  "clear-selection": false
};

describe("isMeaningfulCanvasAction", () => {
  it.each(Object.entries(expectedMeaningByActionType))(
    "classifies %s as meaningful: %s",
    (type, expected) => {
      expect(isMeaningfulCanvasAction({ type } as CanvasAction)).toBe(expected);
    }
  );
});
