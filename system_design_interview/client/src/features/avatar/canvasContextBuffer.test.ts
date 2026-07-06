import { afterEach, describe, expect, it, vi } from "vitest";

import { createCanvasContextBuffer } from "./canvasContextBuffer";

describe("createCanvasContextBuffer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends nothing when no summary has been pushed", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    await vi.advanceTimersByTimeAsync(1200);

    expect(sender).not.toHaveBeenCalled();
    buffer.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hashes every 200ms and waits until the 1000ms send tick", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");

    await vi.advanceTimersByTimeAsync(199);
    expect(buffer.getStatus().hasPendingUpdate).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(buffer.getStatus().hasPendingUpdate).toBe(true);
    expect(sender).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(799);
    expect(sender).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenLastCalledWith("Canvas A");

    buffer.stop();
  });

  it("samples before sending when hash and send ticks share a boundary", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(199);
    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(800);
    buffer.push("Canvas C");
    await vi.advanceTimersByTimeAsync(1);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenLastCalledWith("Canvas C");

    buffer.stop();
  });

  it("keeps only the latest summary inside one send window", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(200);
    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(200);
    buffer.push("Canvas C");
    await vi.advanceTimersByTimeAsync(600);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenLastCalledWith("Canvas C");

    buffer.stop();
  });

  it("dedupes 1800 identical 1Hz summary updates", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    for (let index = 0; index < 1800; index += 1) {
      buffer.push("Canvas v8\nNodes:\nservice api: API Gateway");
      await vi.advanceTimersByTimeAsync(1000);
    }

    expect(sender).toHaveBeenCalledTimes(1);

    buffer.stop();
  });

  it("sends a changed summary on the next send tick after a successful send", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(1, "Canvas A");
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas B");

    buffer.stop();
  });

  it("does not overlap sends while the sender is still in flight", async () => {
    vi.useFakeTimers();
    const resolves: Array<() => void> = [];
    const sender = vi.fn(() => new Promise<void>((resolve) => {
      resolves.push(resolve);
    }));
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sender).toHaveBeenCalledTimes(1);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sender).toHaveBeenCalledTimes(1);

    resolves[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas B");

    buffer.stop();
  });

  it("retries the same summary after a send failure", async () => {
    vi.useFakeTimers();
    const sender = vi.fn()
      .mockRejectedValueOnce(new Error("provider busy"))
      .mockResolvedValue(undefined);
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(buffer.getStatus().hasPendingUpdate).toBe(true);
    expect(buffer.getStatus().lastSentHash).toBeNull();
    expect(buffer.getStatus().error).toBe("provider busy");

    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas A");
    expect(buffer.getStatus().hasPendingUpdate).toBe(false);
    expect(buffer.getStatus().error).toBeNull();

    buffer.stop();
  });

  it("retries the latest summary after a failure if the canvas changes", async () => {
    vi.useFakeTimers();
    const sender = vi.fn()
      .mockRejectedValueOnce(new Error("provider busy"))
      .mockResolvedValue(undefined);
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(1, "Canvas A");
    expect(sender).toHaveBeenNthCalledWith(2, "Canvas B");

    buffer.stop();
  });

  it("clears a send error after reverting to the last successful summary", async () => {
    vi.useFakeTimers();
    const sender = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("provider busy"));
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    buffer.push("Canvas B");
    await vi.advanceTimersByTimeAsync(1000);
    expect(buffer.getStatus().hasPendingUpdate).toBe(true);
    expect(buffer.getStatus().error).toBe("provider busy");

    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(200);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(buffer.getStatus().hasPendingUpdate).toBe(false);
    expect(buffer.getStatus().error).toBeNull();

    buffer.stop();
  });

  it("clears both timers on stop", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.push("Canvas A");
    buffer.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(sender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts idempotently", async () => {
    vi.useFakeTimers();
    const sender = vi.fn();
    const buffer = createCanvasContextBuffer(sender);

    buffer.start();
    buffer.start();
    buffer.push("Canvas A");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledTimes(1);

    buffer.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
