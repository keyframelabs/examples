import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCanvasContextSync } from "@/utils/avatar/canvasContextSync";

describe("createCanvasContextSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the latest snapshot as a versioned contextual update", async () => {
    const sent: string[] = [];
    const sync = createCanvasContextSync({
      sendContextUpdate: (text) => void sent.push(text)
    });

    sync.start();
    sync.push("Canvas v12\nNodes:\nservice api: API");
    sync.push("Canvas v12\nNodes:\nservice api: API v2");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toEqual([
      [
        "Current system design canvas state for the interview:",
        "CanvasState update: 1",
        "This is the latest complete canvas snapshot and supersedes earlier canvas state contextual updates.",
        "Canvas v12\nNodes:\nservice api: API v2",
        "Use this as background context for the next interview turn. Do not react to the update by itself."
      ].join("\n")
    ]);
  });

  it("skips resending unchanged canvases and increments versions on change", async () => {
    const sent: string[] = [];
    const sync = createCanvasContextSync({
      sendContextUpdate: (text) => void sent.push(text)
    });

    sync.start();
    sync.push("state one");
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent).toHaveLength(1);

    sync.push("state one");
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent).toHaveLength(1);

    sync.push("state two");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("CanvasState update: 2");
    expect(sent[1]).toContain("state two");
  });

  it("never overlaps sends while one is in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sync = createCanvasContextSync({
      sendContextUpdate: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        inFlight -= 1;
      }
    });

    sync.start();
    sync.push("first");
    await vi.advanceTimersByTimeAsync(1000);
    sync.push("second");
    await vi.advanceTimersByTimeAsync(5000);

    expect(maxInFlight).toBe(1);
  });

  it("keeps a failed update pending, reports the error, and retries", async () => {
    const sent: string[] = [];
    let failNext = true;
    const sync = createCanvasContextSync({
      sendContextUpdate: (text) => {
        if (failNext) {
          failNext = false;
          throw new Error("socket closed");
        }
        sent.push(text);
      }
    });

    sync.start();
    sync.push("state");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync.getStatus().error).toBe("socket closed");
    expect(sync.getStatus().hasPendingUpdate).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("CanvasState update: 1");
    expect(sync.getStatus().error).toBeNull();
    expect(sync.getStatus().hasPendingUpdate).toBe(false);
  });

  it("reports readiness while running and stops cleanly", async () => {
    const sync = createCanvasContextSync({ sendContextUpdate: () => undefined });

    expect(sync.getStatus().isReady).toBe(false);
    sync.start();
    expect(sync.getStatus().isReady).toBe(true);

    sync.stop();
    sync.push("after stop");
    await vi.advanceTimersByTimeAsync(3000);
    expect(sync.getStatus().isReady).toBe(false);
    expect(sync.getStatus().lastSentAt).toBeNull();
  });
});
