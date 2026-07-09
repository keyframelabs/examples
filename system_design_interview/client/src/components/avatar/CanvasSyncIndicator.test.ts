import { describe, expect, it } from "vitest";

import type { CanvasSyncStatus } from "../../types/canvas-sync-status";
import { getCanvasSyncPrimaryText } from "./CanvasSyncIndicator";

const readyStatus: CanvasSyncStatus = {
  isReady: true,
  isSending: false,
  pendingEdits: 0,
  lastSentAt: null,
  lastSentVersion: 0,
  error: null
};

describe("getCanvasSyncPrimaryText", () => {
  it("reports a canvas send issue when a send error is present", () => {
    expect(
      getCanvasSyncPrimaryText({
        ...readyStatus,
        pendingEdits: 1,
        error: "provider busy"
      })
    ).toBe("Canvas send issue");
  });

  it("reports synced after a clean sent state", () => {
    expect(
      getCanvasSyncPrimaryText({
        ...readyStatus,
        lastSentAt: 1000,
        lastSentVersion: 1
      })
    ).toBe("Synced");
  });

  it("reports syncing while sending or pending without an error", () => {
    expect(
      getCanvasSyncPrimaryText({
        ...readyStatus,
        isSending: true
      })
    ).toBe("Syncing");

    expect(
      getCanvasSyncPrimaryText({
        ...readyStatus,
        pendingEdits: 1
      })
    ).toBe("Syncing");
  });
});
