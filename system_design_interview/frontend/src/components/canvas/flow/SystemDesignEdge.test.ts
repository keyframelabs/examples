import { describe, expect, it } from "vitest";

import { connectionLabelWidth } from "@/components/canvas/flow/connectionLabels";

describe("connection label sizing", () => {
  it("keeps short labels compact and caps long labels", () => {
    expect(connectionLabelWidth("HTTPS")).toBeLessThan(150);
    expect(connectionLabelWidth("routes requests")).toBeGreaterThan(
      connectionLabelWidth("HTTPS")
    );
    expect(connectionLabelWidth("a".repeat(100))).toBe(180);
  });
});
