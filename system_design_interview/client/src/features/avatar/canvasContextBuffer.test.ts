import { afterEach, describe, expect, it, vi } from "vitest";

import { createCanvasContextBuffer } from "./canvasContextBuffer";

describe("createCanvasContextBuffer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the latest pushed summary on the buffered cadence", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(500);
    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(500);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith("Canvas B");

    buffer.stop();
  });

  it("dedupes unchanged summaries while still sending later changes", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(1, "Canvas A");
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas B");

    buffer.stop();
  });

  it("waits for in-flight sends before sending the latest pending summary", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    let finishFirstSend: (() => void) | undefined;
    const sender = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<void>((resolve) => {
          finishFirstSend = resolve;
        });
      }

      return Promise.resolve();
    });
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sender).toHaveBeenCalledTimes(1);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sender).toHaveBeenCalledTimes(1);

    finishFirstSend?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas B");

    buffer.stop();
  });
});
