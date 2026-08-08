import { describe, expect, it } from "vitest";

import {
  fieldHandleId,
  nodeAnchorHandleId,
  parseHandleId
} from "@/components/canvas/flow/handles";

describe("handle ids", () => {
  it("round-trips node anchors", () => {
    expect(parseHandleId(nodeAnchorHandleId("bottom-left"))).toEqual({
      anchor: "bottom-left"
    });
  });

  it("round-trips field handles, including ids with separator characters", () => {
    expect(parseHandleId(fieldHandleId("field_123", "left"))).toEqual({
      fieldId: "field_123",
      fieldSide: "left"
    });
    expect(parseHandleId(fieldHandleId("weird:id", "right"))).toEqual({
      fieldId: "weird:id",
      fieldSide: "right"
    });
  });

  it("falls back to the right anchor for missing handles", () => {
    expect(parseHandleId(null)).toEqual({ anchor: "right" });
    expect(parseHandleId(undefined)).toEqual({ anchor: "right" });
  });
});
