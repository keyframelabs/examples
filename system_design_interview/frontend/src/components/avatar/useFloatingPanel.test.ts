import { describe, expect, it } from "vitest";

import {
  clampPosition,
  fitPanelSizeToViewport,
  initialPanelSize,
  initialPosition
} from "@/components/avatar/useFloatingPanel";
import {
  createCanvasFitViewOptions,
  measureCanvasRightOcclusion
} from "@/components/canvas/fitView";

describe("floating avatar panel layout", () => {
  it("starts at the compact default size below the canvas controls", () => {
    const viewport = { width: 1200, height: 1000 };
    const size = initialPanelSize(viewport);
    const position = initialPosition(size.width, size.height, viewport);

    expect(size).toEqual({ width: 320, height: 640 });
    expect(position).toEqual({ x: 856, y: 78 });
  });

  it("uses one compact startup size across unconstrained wide viewports", () => {
    expect(initialPanelSize({ width: 1200, height: 1000 })).toEqual({
      width: 320,
      height: 640
    });
    expect(initialPanelSize({ width: 1920, height: 1080 })).toEqual({
      width: 320,
      height: 640
    });
  });

  it("keeps the compact default when a shorter viewport can fit it", () => {
    const viewport = { width: 1456, height: 819 };
    const size = initialPanelSize(viewport);
    const position = initialPosition(size.width, size.height, viewport);

    expect(size).toEqual({ width: 320, height: 640 });
    expect(position).toEqual({ x: 1112, y: 78 });
  });

  it("reserves exact canvas space for the compact default panel", () => {
    const viewport = { width: 1456, height: 819 };
    const size = initialPanelSize(viewport);
    const position = initialPosition(size.width, size.height, viewport);
    const occlusion = measureCanvasRightOcclusion(
      { left: position.x, width: size.width },
      viewport.width
    );

    expect(occlusion).toEqual({ inset: 344, viewportWidth: 1456 });
    expect(createCanvasFitViewOptions(occlusion)).toEqual({
      padding: {
        top: "96px",
        right: "376px",
        bottom: "32px",
        left: "32px"
      }
    });
  });

  it("allows the compact panel to grow to the prior maximum width", () => {
    expect(
      fitPanelSizeToViewport(
        { width: 500, height: 1000 },
        { width: 1200, height: 1000 }
      )
    ).toEqual({ width: 404, height: 808 });
  });

  it("fits the initial panel within short and narrow viewports", () => {
    const shortViewport = { width: 320, height: 400 };
    const shortSize = initialPanelSize(shortViewport);
    const shortPosition = initialPosition(
      shortSize.width,
      shortSize.height,
      shortViewport
    );

    expect(shortPosition.y).toBe(78);
    expect(shortPosition.y + shortSize.height).toBeCloseTo(388);

    const narrowViewport = { width: 220, height: 900 };
    const narrowSize = initialPanelSize(narrowViewport);
    const narrowPosition = initialPosition(
      narrowSize.width,
      narrowSize.height,
      narrowViewport
    );

    expect(narrowPosition.x).toBe(12);
    expect(narrowPosition.x + narrowSize.width).toBe(208);
  });

  it("shrinks an existing panel to fit after the viewport becomes short", () => {
    const initialViewport = { width: 1200, height: 900 };
    const shortViewport = { width: 320, height: 400 };
    const initialSize = initialPanelSize(initialViewport);
    const initialPanelPosition = initialPosition(
      initialSize.width,
      initialSize.height,
      initialViewport
    );

    const resizedSize = fitPanelSizeToViewport(initialSize, shortViewport);
    const resizedPosition = clampPosition(
      initialPanelPosition,
      resizedSize.width,
      resizedSize.height,
      shortViewport
    );

    expect(resizedSize.width / resizedSize.height).toBeCloseTo(
      initialSize.width / initialSize.height
    );
    expect(resizedPosition.y).toBe(78);
    expect(resizedPosition.y + resizedSize.height).toBeCloseTo(388);
  });

  it("clamps dragged positions below controls and inside viewport margins", () => {
    expect(
      clampPosition(
        { x: -100, y: -100 },
        280,
        560,
        { width: 1000, height: 800 }
      )
    ).toEqual({ x: 12, y: 78 });

    expect(
      clampPosition(
        { x: 1000, y: 800 },
        280,
        560,
        { width: 1000, height: 800 }
      )
    ).toEqual({ x: 708, y: 228 });
  });
});
