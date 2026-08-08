import { describe, expect, it } from "vitest";

import {
  clampPosition,
  fitPanelSizeToViewport,
  initialPanelSize,
  initialPosition
} from "@/components/avatar/useFloatingPanel";

describe("floating avatar panel layout", () => {
  it("starts compact below the canvas controls on ordinary viewports", () => {
    const viewport = { width: 1200, height: 1000 };
    const size = initialPanelSize(viewport);
    const position = initialPosition(size.width, size.height, viewport);

    expect(size).toEqual({ width: 320, height: 640 });
    expect(position).toEqual({ x: 856, y: 78 });
  });

  it("caps panel width at the maximum while preserving aspect ratio", () => {
    expect(
      fitPanelSizeToViewport(
        { width: 500, height: 1000 },
        { width: 1200, height: 1000 }
      )
    ).toEqual({ width: 404, height: 808 });
  });

  it("fits inside short and narrow viewports", () => {
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

  it("preserves aspect ratio when the viewport later shrinks", () => {
    const initialSize = initialPanelSize({ width: 1200, height: 900 });
    const resized = fitPanelSizeToViewport(initialSize, {
      width: 320,
      height: 400
    });

    expect(resized.width / resized.height).toBeCloseTo(
      initialSize.width / initialSize.height
    );
    expect(resized.height).toBeLessThanOrEqual(400 - 78 - 12);
  });

  it("clamps dragged positions below the controls and inside the margins", () => {
    const viewport = { width: 1000, height: 800 };

    expect(clampPosition({ x: -100, y: -100 }, 280, 560, viewport)).toEqual({
      x: 12,
      y: 78
    });
    expect(clampPosition({ x: 1000, y: 800 }, 280, 560, viewport)).toEqual({
      x: 708,
      y: 228
    });
  });
});
