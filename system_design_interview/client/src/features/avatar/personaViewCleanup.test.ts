import type { PersonaView } from "@keyframelabs/elements";
import { describe, expect, it, vi } from "vitest";

import type { CanvasContextSync } from "./canvasContextSync";
import {
  cleanupPersonaViewRuntime,
  type PersonaViewRuntime
} from "./personaViewCleanup";

describe("cleanupPersonaViewRuntime", () => {
  it("awaits PersonaView disconnect before removing media elements", async () => {
    const events: string[] = [];
    let finishDisconnect: (() => void) | undefined;
    const videoRemove = vi.fn(() => events.push("video:remove"));
    const audioRemove = vi.fn(() => events.push("audio:remove"));
    const runtime = makeRuntime({
      disconnect: vi.fn(() => new Promise<void>((resolve) => {
        events.push("disconnect:start");
        finishDisconnect = () => {
          events.push("disconnect:finish");
          resolve();
        };
      })),
      onStop: () => events.push("context:stop"),
      onDetachTranscriptObserver: () => events.push("transcript:detach"),
      videoRemove,
      audioRemove
    });

    const cleanupPromise = cleanupPersonaViewRuntime(runtime);
    await Promise.resolve();

    expect(runtime.closeState.expected).toBe(true);
    expect(events).toEqual([
      "context:stop",
      "transcript:detach",
      "disconnect:start"
    ]);
    expect(videoRemove).not.toHaveBeenCalled();
    expect(audioRemove).not.toHaveBeenCalled();

    finishDisconnect?.();
    await cleanupPromise;

    expect(events).toEqual([
      "context:stop",
      "transcript:detach",
      "disconnect:start",
      "disconnect:finish",
      "video:remove",
      "audio:remove"
    ]);
  });

  it("removes media elements and propagates disconnect failures", async () => {
    const disconnectError = new Error("disconnect failed");
    const videoRemove = vi.fn();
    const audioRemove = vi.fn();
    const runtime = makeRuntime({
      disconnect: vi.fn(async () => {
        throw disconnectError;
      }),
      videoRemove,
      audioRemove
    });

    await expect(cleanupPersonaViewRuntime(runtime)).rejects.toThrow(disconnectError);
    expect(videoRemove).toHaveBeenCalledOnce();
    expect(audioRemove).toHaveBeenCalledOnce();
  });
});

function makeRuntime({
  disconnect,
  onStop = () => undefined,
  onDetachTranscriptObserver = () => undefined,
  videoRemove = () => undefined,
  audioRemove = () => undefined
}: {
  disconnect: () => void | Promise<void>;
  onStop?: () => void;
  onDetachTranscriptObserver?: () => void;
  videoRemove?: () => void;
  audioRemove?: () => void;
}): PersonaViewRuntime {
  return {
    view: {
      disconnect,
      videoElement: { remove: videoRemove },
      audioElement: { remove: audioRemove }
    } as unknown as PersonaView,
    contextSync: {
      push: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(onStop),
      getStatus: vi.fn()
    } as unknown as CanvasContextSync,
    detachTranscriptObserver: vi.fn(onDetachTranscriptObserver),
    closeState: {
      expected: false,
      disconnectHandled: false
    }
  };
}
