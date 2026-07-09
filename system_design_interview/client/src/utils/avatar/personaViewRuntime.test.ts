import type { PersonaView } from "@keyframelabs/elements";
import { describe, expect, it, vi } from "vitest";

import type { CanvasContextSync } from "./canvasContextSync";
import {
  attachPersonaTranscriptObserver,
  cleanupPersonaViewRuntime,
  type PersonaViewRuntime,
  sendPersonaContext
} from "./personaViewRuntime";

describe("sendPersonaContext", () => {
  it("sends context through the PersonaView-owned voice agent when supported", () => {
    const sendContext = vi.fn();
    const view = {
      agent: { sendContext }
    } as unknown as PersonaView;

    sendPersonaContext(view, "CanvasState update: 1");

    expect(sendContext).toHaveBeenCalledWith("CanvasState update: 1");
  });

  it("throws a clear error when PersonaView does not expose contextual updates", () => {
    const view = {
      agent: {}
    } as unknown as PersonaView;

    expect(() => sendPersonaContext(view, "CanvasState update: 1"))
      .toThrow("PersonaView voice agent does not support contextual updates.");
  });
});

describe("attachPersonaTranscriptObserver", () => {
  it("forwards valid transcript payloads from the PersonaView-owned agent", () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const view = {
      agent: {
        on: vi.fn((event: string, handler: (payload: unknown) => void) => {
          listeners.set(event, handler);
        }),
        off: vi.fn((event: string) => {
          listeners.delete(event);
        })
      }
    } as unknown as PersonaView;
    const onTranscript = vi.fn();

    const detach = attachPersonaTranscriptObserver(view, onTranscript);
    listeners.get("transcript")?.({
      role: "assistant",
      text: "Let's discuss scale.",
      isFinal: true
    });
    listeners.get("transcript")?.({ role: "assistant", text: "missing final flag" });
    detach();

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith({
      role: "assistant",
      text: "Let's discuss scale.",
      isFinal: true
    });
    expect(listeners.has("transcript")).toBe(false);
  });
});

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
