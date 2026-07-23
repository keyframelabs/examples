import { describe, expect, it } from "vitest";

import {
  clampPosition,
  fitPanelSizeToViewport,
  initialPanelSize,
  initialPosition
} from "@/components/avatar/useFloatingPanel";

describe("floating avatar panel layout", () => {
  it("starts below the canvas controls with clear spacing", () => {
    const viewport = { width: 1200, height: 900 };
    const size = initialPanelSize(viewport);

    expect(initialPosition(size.width, size.height, viewport)).toEqual({
      x: 896,
      y: 78
    });
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
