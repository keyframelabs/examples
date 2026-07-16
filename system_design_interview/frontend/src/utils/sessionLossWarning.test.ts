import { describe, expect, it, vi } from "vitest";

import {
  registerSessionLossWarning,
  shouldWarnAboutSessionLoss
} from "@/utils/sessionLossWarning";

describe("shouldWarnAboutSessionLoss", () => {
  it.each([
    [{ hasCanvasEdits: false, isSessionActive: false }, false],
    [{ hasCanvasEdits: true, isSessionActive: false }, true],
    [{ hasCanvasEdits: false, isSessionActive: true }, true],
    [{ hasCanvasEdits: true, isSessionActive: true }, true]
  ])("returns $expected for $0", (state, expected) => {
    expect(shouldWarnAboutSessionLoss(state)).toBe(expected);
  });
});

describe("registerSessionLossWarning", () => {
  it("registers one beforeunload listener that prevents session loss", () => {
    const { target, addEventListener } = fakeTarget();

    registerSessionLossWarning(target);

    expect(addEventListener).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );

    const listener = addEventListener.mock.calls[0]?.[1] as (
      event: BeforeUnloadEvent
    ) => void;
    const event = {
      preventDefault: vi.fn(),
      returnValue: false
    } as unknown as BeforeUnloadEvent;

    listener(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(true);
  });

  it("removes the identical listener during cleanup", () => {
    const { target, addEventListener, removeEventListener } = fakeTarget();
    const cleanup = registerSessionLossWarning(target);
    const listener = addEventListener.mock.calls[0]?.[1];

    cleanup();

    expect(removeEventListener).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", listener);
  });
});

function fakeTarget() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const target = {
    addEventListener,
    removeEventListener
  } as unknown as Parameters<typeof registerSessionLossWarning>[0];

  return { target, addEventListener, removeEventListener };
}
