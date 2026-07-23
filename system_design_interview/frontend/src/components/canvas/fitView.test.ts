import type { Node } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import {
  areNodesMeasuredForFit,
  createCanvasFitViewOptions,
  measureCanvasRightOcclusion,
  runInitialCanvasFit,
  subscribeToViewportResize
} from "@/components/canvas/fitView";

describe("canvas fit view", () => {
  it("uses toolbar and edge clearance without a floating-panel occlusion", () => {
    expect(createCanvasFitViewOptions(null)).toEqual({
      padding: {
        top: "96px",
        right: "32px",
        bottom: "32px",
        left: "32px"
      }
    });
  });

  it("reserves the current right-side panel inset plus a visible gutter", () => {
    expect(
      createCanvasFitViewOptions({ inset: 304, viewportWidth: 1200 })
    ).toEqual({
      padding: {
        top: "96px",
        right: "336px",
        bottom: "32px",
        left: "32px"
      }
    });
  });

  it("remeasures occlusion when the viewport widens around a fixed panel", () => {
    const panelBounds = { left: 896, width: 280 };

    expect(measureCanvasRightOcclusion(panelBounds, 1200)).toEqual({
      inset: 304,
      viewportWidth: 1200
    });
    const widenedOcclusion = measureCanvasRightOcclusion(panelBounds, 1400);
    expect(widenedOcclusion).toEqual({
      inset: 504,
      viewportWidth: 1400
    });
    expect(createCanvasFitViewOptions(widenedOcclusion)).toEqual({
      padding: {
        top: "96px",
        right: "536px",
        bottom: "32px",
        left: "32px"
      }
    });
  });

  it("cleans up its viewport resize subscription", () => {
    let resizeListener: (() => void) | undefined;
    const target = {
      addEventListener: vi.fn((type: "resize", listener: () => void) => {
        resizeListener = listener;
      }),
      removeEventListener: vi.fn((type: "resize", listener: () => void) => {
        if (resizeListener === listener) resizeListener = undefined;
      })
    };
    const report = vi.fn();

    const unsubscribe = subscribeToViewportResize(target, report);
    resizeListener?.();

    expect(report).toHaveBeenCalledOnce();
    expect(target.addEventListener).toHaveBeenCalledWith("resize", report);

    unsubscribe();

    expect(target.removeEventListener).toHaveBeenCalledWith("resize", report);
    expect(resizeListener).toBeUndefined();
  });

  it("keeps padding valid when the panel consumes a narrow viewport", () => {
    expect(
      createCanvasFitViewOptions({ inset: 208, viewportWidth: 220 })
    ).toEqual({
      padding: {
        top: "96px",
        right: "187px",
        bottom: "32px",
        left: "32px"
      }
    });
  });

  it("waits for every populated canvas node to have usable measurements", () => {
    expect(areNodesMeasuredForFit(0, [])).toBe(false);
    expect(
      areNodesMeasuredForFit(2, [
        { measured: { width: 160, height: 80 } },
        { measured: { width: 160 } }
      ])
    ).toBe(false);
    expect(
      areNodesMeasuredForFit(2, [
        { measured: { width: 160, height: 80 } },
        { measured: { width: 220, height: 144 } }
      ])
    ).toBe(true);
  });

  it("fits exactly once after the initial nodes become measured", () => {
    const handledRef = { current: false };
    const occlusion = { inset: 304, viewportWidth: 1200 };
    const fitViewOptions = createCanvasFitViewOptions(occlusion);
    const fitView = vi.fn();
    const unmeasuredNodes: Node[] = [
      { id: "api", position: { x: 0, y: 0 }, data: {} }
    ];
    const measuredNodes: Node[] = [
      {
        ...unmeasuredNodes[0],
        measured: { width: 160, height: 80 }
      }
    ];

    expect(
      runInitialCanvasFit({
        handledRef,
        occlusion,
        expectedNodeCount: 1,
        nodes: unmeasuredNodes,
        fitViewOptions,
        fitView
      })
    ).toBe(false);
    expect(fitView).not.toHaveBeenCalled();

    expect(
      runInitialCanvasFit({
        handledRef,
        occlusion,
        expectedNodeCount: 1,
        nodes: measuredNodes,
        fitViewOptions,
        fitView
      })
    ).toBe(true);
    expect(fitView).toHaveBeenCalledOnce();
    expect(fitView).toHaveBeenCalledWith(fitViewOptions);

    expect(
      runInitialCanvasFit({
        handledRef,
        occlusion: { inset: 500, viewportWidth: 1200 },
        expectedNodeCount: 1,
        nodes: measuredNodes,
        fitViewOptions: createCanvasFitViewOptions({
          inset: 500,
          viewportWidth: 1200
        }),
        fitView
      })
    ).toBe(false);
    expect(fitView).toHaveBeenCalledOnce();
  });

  it("consumes an empty canvas's initial fit without fitting later additions", () => {
    const handledRef = { current: false };
    const occlusion = { inset: 304, viewportWidth: 1200 };
    const fitViewOptions = createCanvasFitViewOptions(occlusion);
    const fitView = vi.fn();

    expect(
      runInitialCanvasFit({
        handledRef,
        occlusion,
        expectedNodeCount: 0,
        nodes: [],
        fitViewOptions,
        fitView
      })
    ).toBe(false);
    expect(handledRef.current).toBe(true);

    expect(
      runInitialCanvasFit({
        handledRef,
        occlusion,
        expectedNodeCount: 1,
        nodes: [
          {
            id: "later",
            position: { x: 0, y: 0 },
            data: {},
            measured: { width: 160, height: 80 }
          }
        ],
        fitViewOptions,
        fitView
      })
    ).toBe(false);
    expect(fitView).not.toHaveBeenCalled();
  });
});
