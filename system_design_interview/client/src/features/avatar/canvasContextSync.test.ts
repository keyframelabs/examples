import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCanvasContextSync,
  type CanvasContextSyncStatus
} from "./canvasContextSync";

describe("createCanvasContextSync", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends versioned persona contextual update payloads on the buffered cadence", async () => {
    vi.useFakeTimers();
    const sendContextUpdate = vi.fn();
    const sync = createCanvasContextSync({ sendContextUpdate });

    sync.start();
    sync.push("Canvas v8\nNodes:\nservice api: API Gateway");
    await vi.advanceTimersByTimeAsync(1000);

    sync.push("Canvas v8\nNodes:\nservice api: Edge API");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sendContextUpdate).toHaveBeenCalledTimes(2);
    expect(sendContextUpdate.mock.calls[0]?.[0]).toContain("CanvasState update: 1");
    expect(sendContextUpdate.mock.calls[0]?.[0]).toContain("service api: API Gateway");
    expect(sendContextUpdate.mock.calls[0]?.[0]).toContain("supersedes earlier canvas state contextual updates");
    expect(sendContextUpdate.mock.calls[1]?.[0]).toContain("CanvasState update: 2");
    expect(sendContextUpdate.mock.calls[1]?.[0]).toContain("service api: Edge API");

    sync.stop();
  });

  it("reports buffered pending, sending, sent, and version status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const statuses: CanvasContextSyncStatus[] = [];
    const sendContextUpdate = vi.fn();
    const sync = createCanvasContextSync({
      sendContextUpdate,
      onStatusChange: (status) => {
        statuses.push(status);
      }
    });

    sync.start();
    sync.push("Canvas A");
    await vi.advanceTimersByTimeAsync(200);

    expect(sync.getStatus()).toMatchObject({
      isRunning: true,
      pendingEdits: 1,
      lastSentVersion: 0,
      error: null
    });

    await vi.advanceTimersByTimeAsync(800);

    expect(sync.getStatus()).toMatchObject({
      pendingEdits: 0,
      lastSentAt: 1000,
      lastSentVersion: 1,
      error: null
    });
    expect(statuses.some((status) => status.isSending)).toBe(true);

    sync.stop();
  });
});
