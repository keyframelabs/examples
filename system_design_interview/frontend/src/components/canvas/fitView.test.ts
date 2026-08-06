import {
  getViewportForBounds,
  type Node,
  type Rect,
  type Viewport
} from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import {
  alignViewportToCanvasLeft,
  areNodesMeasuredForFit,
  createCanvasFitViewOptions,
  fitCanvasToLeft,
  measureCanvasRightOcclusion,
  runInitialCanvasFit,
  subscribeToViewportResize
} from "@/components/canvas/fitView";

describe("canvas fit view", () => {
  it("places fitted content at the left inset when it fits before the panel", () => {
    expect(
      alignViewportToCanvasLeft(
        { x: 220, y: 80, zoom: 0.5 },
        { x: 100, y: 20, width: 400, height: 900 },
        { inset: 304, viewportWidth: 1200 }
      )
    ).toEqual({ x: 35, y: 80, zoom: 0.5 });
  });

  it("preserves the fitted viewport when left alignment would hit the panel", () => {
    const viewport = { x: -167.5, y: 283.5, zoom: 0.25 };

    expect(
      alignViewportToCanvasLeft(
        viewport,
        { x: 0, y: 0, width: 800, height: 400 },
        { inset: 309.67, viewportWidth: 375 }
      )
    ).toBe(viewport);
  });

  it("preserves the fitted viewport without usable-region geometry", () => {
    const viewport = { x: 220, y: 80, zoom: 0.5 };

    expect(
      alignViewportToCanvasLeft(
        viewport,
        { x: 100, y: 20, width: 400, height: 900 },
        null
      )
    ).toBe(viewport);
  });

  it("leaves an invalid viewport unchanged", () => {
    const viewport = { x: 220, y: 80, zoom: 0 };

    expect(
      alignViewportToCanvasLeft(
        viewport,
        { x: 100, y: 20, width: 800, height: 900 },
        { inset: 304, viewportWidth: 1200 }
      )
    ).toBe(viewport);
  });

  it("fits before explicitly aligning every node to the left inset", async () => {
    const calls: string[] = [];
    const nodes: Node[] = [
      { id: "user", position: { x: 100, y: 20 }, data: {} },
      { id: "database", position: { x: 500, y: 600 }, data: {} }
    ];
    const occlusion = { inset: 304, viewportWidth: 1200 };
    const fitViewOptions = createCanvasFitViewOptions<Node>(occlusion);
    const fitView = vi.fn(async () => {
      calls.push("fit");
      return true;
    });
    const getNodesBounds = vi.fn(() => ({
      x: 100,
      y: 20,
      width: 400,
      height: 900
    }));
    const setViewport = vi.fn(async () => {
      calls.push("align");
      return true;
    });

    const didFit = await fitCanvasToLeft(
      {
        fitView,
        getNodes: () => nodes,
        getNodesBounds,
        getViewport: () => ({ x: 220, y: 80, zoom: 0.5 }),
        setViewport
      },
      fitViewOptions,
      occlusion
    );

    expect(didFit).toBe(true);
    expect(calls).toEqual(["fit", "align"]);
    expect(fitView).toHaveBeenCalledWith(fitViewOptions);
    expect(getNodesBounds).toHaveBeenCalledWith(nodes);
    expect(setViewport).toHaveBeenCalledWith({
      x: 35,
      y: 80,
      zoom: 0.5
    });
  });

  it.each([
    {
      name: "a normal wide viewport with a right-side panel",
      viewportWidth: 1200,
      viewportHeight: 900,
      panelLeft: 896,
      panelWidth: 280,
      bounds: { x: 0, y: 0, width: 400, height: 800 },
      expectLeftAligned: true
    },
    {
      name: "a short viewport with a right-side panel",
      viewportWidth: 1200,
      viewportHeight: 400,
      panelLeft: 896,
      panelWidth: 280,
      bounds: { x: 0, y: 0, width: 400, height: 800 },
      expectLeftAligned: true
    },
    {
      name: "a narrow viewport mostly consumed by the panel",
      viewportWidth: 375,
      viewportHeight: 667,
      panelLeft: 65.33,
      panelWidth: 285.67,
      bounds: { x: 0, y: 0, width: 800, height: 400 },
      expectLeftAligned: false
    },
    {
      name: "a panel dragged toward the left",
      viewportWidth: 1200,
      viewportHeight: 800,
      panelLeft: 300,
      panelWidth: 400,
      bounds: { x: 0, y: 0, width: 800, height: 400 },
      expectLeftAligned: false
    },
    {
      name: "a viewport without panel geometry",
      viewportWidth: 1200,
      viewportHeight: 800,
      panelLeft: null,
      panelWidth: 0,
      bounds: { x: 0, y: 0, width: 400, height: 800 },
      expectLeftAligned: false
    }
  ])(
    "does not reduce visible fitted content for $name",
    async ({
      viewportWidth,
      viewportHeight,
      panelLeft,
      panelWidth,
      bounds,
      expectLeftAligned
    }) => {
      const result = await fitThenAlign({
        viewportWidth,
        viewportHeight,
        panelLeft,
        panelWidth,
        bounds
      });

      expect(result.afterVisible).toBeGreaterThanOrEqual(
        result.beforeVisible
      );

      if (expectLeftAligned) {
        expect(renderedHorizontalBounds(result.after, bounds).left).toBe(85);
        expect(
          renderedHorizontalBounds(result.after, bounds).right
        ).toBeLessThanOrEqual(result.usableRight);
      } else {
        expect(result.after).toEqual(result.before);
      }
    }
  );

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
      addEventListener: vi.fn((_type: "resize", listener: () => void) => {
        resizeListener = listener;
      }),
      removeEventListener: vi.fn((_type: "resize", listener: () => void) => {
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

  it("falls back to edge clearance when occlusion measurements are invalid", () => {
    expect(
      createCanvasFitViewOptions({
        inset: Number.NaN,
        viewportWidth: Number.NaN
      })
    ).toEqual({
      padding: {
        top: "96px",
        right: "32px",
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

async function fitThenAlign({
  viewportWidth,
  viewportHeight,
  panelLeft,
  panelWidth,
  bounds
}: {
  viewportWidth: number;
  viewportHeight: number;
  panelLeft: number | null;
  panelWidth: number;
  bounds: Rect;
}) {
  const occlusion =
    panelLeft === null
      ? null
      : measureCanvasRightOcclusion(
          { left: panelLeft, width: panelWidth },
          viewportWidth
        );
  const options = createCanvasFitViewOptions<Node>(occlusion);
  const nodes: Node[] = [
    { id: "architecture", position: { x: bounds.x, y: bounds.y }, data: {} }
  ];
  let currentViewport: Viewport = { x: 0, y: 0, zoom: 1 };
  let fittedViewport: Viewport | null = null;

  await fitCanvasToLeft(
    {
      fitView: async (fitOptions = {}) => {
        currentViewport = getViewportForBounds(
          bounds,
          viewportWidth,
          viewportHeight,
          0.25,
          2,
          fitOptions.padding ?? 0
        );
        fittedViewport = currentViewport;
        return true;
      },
      getNodes: () => nodes,
      getNodesBounds: () => bounds,
      getViewport: () => currentViewport,
      setViewport: async (viewport) => {
        currentViewport = viewport;
        return true;
      }
    },
    options,
    occlusion
  );

  if (!fittedViewport) throw new Error("fitView did not produce a viewport");

  const usableRight = occlusion
    ? Math.max(32, viewportWidth - occlusion.inset - 32)
    : viewportWidth - 32;

  return {
    before: fittedViewport,
    after: currentViewport,
    beforeVisible: visibleHorizontalWidth(fittedViewport, bounds, usableRight),
    afterVisible: visibleHorizontalWidth(currentViewport, bounds, usableRight),
    usableRight
  };
}

function visibleHorizontalWidth(
  viewport: Viewport,
  bounds: Rect,
  usableRight: number
): number {
  const rendered = renderedHorizontalBounds(viewport, bounds);
  return Math.max(
    0,
    Math.min(rendered.right, usableRight) - Math.max(rendered.left, 32)
  );
}

function renderedHorizontalBounds(viewport: Viewport, bounds: Rect) {
  const left = bounds.x * viewport.zoom + viewport.x;
  return {
    left,
    right: left + bounds.width * viewport.zoom
  };
}
