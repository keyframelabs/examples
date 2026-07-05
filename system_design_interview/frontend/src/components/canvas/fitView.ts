import type {
  FitViewOptions,
  Node,
  ReactFlowInstance,
  Rect,
  Viewport
} from "@xyflow/react";

/** How much of the canvas viewport the floating avatar panel covers, in px. */
export type CanvasRightOcclusion = {
  inset: number;
  viewportWidth: number;
};

const TOP_PADDING = 96;
const SIDE_PADDING = 32;
const BOTTOM_PADDING = 32;
const OCCLUSION_GUTTER = 32;
// The control panel ends at 59px; keep a 26px gap before fitted nodes.
const FITTED_CONTENT_LEFT_INSET = 85;

export function measureCanvasRightOcclusion(
  panelBounds: { left: number; width: number },
  viewportWidth: number
): CanvasRightOcclusion | null {
  if (panelBounds.width <= 0 || viewportWidth <= 0) return null;

  return {
    inset: Math.max(0, viewportWidth - panelBounds.left),
    viewportWidth
  };
}

export function createCanvasFitViewOptions<NodeType extends Node = Node>(
  occlusion: CanvasRightOcclusion | null
): FitViewOptions<NodeType> {
  return {
    padding: {
      top: `${TOP_PADDING}px`,
      right: `${occlusion ? rightPaddingForOcclusion(occlusion) : SIDE_PADDING}px`,
      bottom: `${BOTTOM_PADDING}px`,
      left: `${SIDE_PADDING}px`
    }
  };
}

/**
 * Fits the view, then nudges the content flush to the left inset when it
 * comfortably fits in the un-occluded area. This keeps diagrams out from
 * under the floating avatar panel without shrinking them unnecessarily.
 */
export async function fitCanvasToLeft<NodeType extends Node>(
  instance: Pick<
    ReactFlowInstance<NodeType>,
    "fitView" | "getNodes" | "getNodesBounds" | "getViewport" | "setViewport"
  >,
  options: FitViewOptions<NodeType>,
  occlusion: CanvasRightOcclusion | null
): Promise<void> {
  await instance.fitView(options);
  const nodes = instance.getNodes();
  if (nodes.length === 0) return;

  const fitted = instance.getViewport();
  const viewport = alignViewportToCanvasLeft(
    fitted,
    instance.getNodesBounds(nodes),
    occlusion
  );
  if (viewport !== fitted) {
    await instance.setViewport(viewport);
  }
}

function alignViewportToCanvasLeft(
  viewport: Viewport,
  bounds: Rect,
  occlusion: CanvasRightOcclusion | null
): Viewport {
  if (!occlusion || viewport.zoom <= 0) return viewport;

  const usableRight = Math.max(
    SIDE_PADDING,
    occlusion.viewportWidth - Math.max(0, occlusion.inset) - OCCLUSION_GUTTER
  );
  const renderedWidth = bounds.width * viewport.zoom;
  if (FITTED_CONTENT_LEFT_INSET + renderedWidth > usableRight) {
    return viewport;
  }

  const renderedLeft = bounds.x * viewport.zoom + viewport.x;
  if (renderedLeft === FITTED_CONTENT_LEFT_INSET) return viewport;

  return {
    ...viewport,
    x: viewport.x + FITTED_CONTENT_LEFT_INSET - renderedLeft
  };
}

function rightPaddingForOcclusion({
  inset,
  viewportWidth
}: CanvasRightOcclusion): number {
  const safeViewportWidth = Math.max(0, Math.floor(viewportWidth));
  const safeInset = Math.min(safeViewportWidth, Math.max(0, Math.ceil(inset)));
  const requested = Math.max(SIDE_PADDING, safeInset + OCCLUSION_GUTTER);
  const maximum = Math.max(0, safeViewportWidth - SIDE_PADDING - 1);

  return Math.min(requested, maximum);
}
