import type { PersonaView } from "@keyframelabs/elements";
import { describe, expect, it, vi } from "vitest";

import {
  attachPersonaTranscriptObserver,
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
