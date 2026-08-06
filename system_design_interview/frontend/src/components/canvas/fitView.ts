import type {
  FitViewOptions,
  Node,
  ReactFlowInstance,
  Rect,
  Viewport
} from "@xyflow/react";

export type CanvasRightOcclusion = {
  inset: number;
  viewportWidth: number;
};

type PanelHorizontalBounds = {
  left: number;
  width: number;
};

type ViewportResizeTarget = {
  addEventListener: (type: "resize", listener: () => void) => void;
  removeEventListener: (type: "resize", listener: () => void) => void;
};

type MeasuredNode = {
  measured?: {
    width?: number;
    height?: number;
  };
};

const TOP_PADDING = 96;
const SIDE_PADDING = 32;
const BOTTOM_PADDING = 32;
const OCCLUSION_GUTTER = 32;
// The control panel ends at 59px; keep a 26px gap before fitted nodes.
const FITTED_CONTENT_LEFT_INSET = 85;

export function measureCanvasRightOcclusion(
  panelBounds: PanelHorizontalBounds,
  viewportWidth: number
): CanvasRightOcclusion | null {
  if (
    !Number.isFinite(panelBounds.left)
    || !Number.isFinite(panelBounds.width)
    || !Number.isFinite(viewportWidth)
    || panelBounds.width <= 0
    || viewportWidth <= 0
  ) {
    return null;
  }

  return {
    inset: Math.max(0, viewportWidth - panelBounds.left),
    viewportWidth
  };
}

export function subscribeToViewportResize(
  target: ViewportResizeTarget,
  listener: () => void
): () => void {
  target.addEventListener("resize", listener);
  return () => target.removeEventListener("resize", listener);
}

export function createCanvasFitViewOptions<NodeType extends Node = Node>(
  occlusion: CanvasRightOcclusion | null
): FitViewOptions<NodeType> {
  const rightPadding = occlusion
    ? rightPaddingForOcclusion(occlusion)
    : SIDE_PADDING;

  return {
    padding: {
      top: `${TOP_PADDING}px`,
      right: `${rightPadding}px`,
      bottom: `${BOTTOM_PADDING}px`,
      left: `${SIDE_PADDING}px`
    }
  };
}

export function alignViewportToCanvasLeft(
  viewport: Viewport,
  bounds: Rect,
  occlusion: CanvasRightOcclusion | null,
  leftInset = FITTED_CONTENT_LEFT_INSET
): Viewport {
  const values = [
    viewport.x,
    viewport.y,
    viewport.zoom,
    bounds.x,
    bounds.width,
    leftInset
  ];
  if (
    !occlusion
    || !values.every(Number.isFinite)
    || viewport.zoom <= 0
    || bounds.width < 0
  ) {
    return viewport;
  }

  const usableRight = usableCanvasRightEdge(occlusion);
  const renderedWidth = bounds.width * viewport.zoom;
  if (
    !Number.isFinite(usableRight)
    || leftInset < SIDE_PADDING
    || leftInset + renderedWidth > usableRight
  ) {
    return viewport;
  }

  const renderedLeft = bounds.x * viewport.zoom + viewport.x;
  if (renderedLeft === leftInset) return viewport;

  return {
    ...viewport,
    x: viewport.x + leftInset - renderedLeft
  };
}

export async function fitCanvasToLeft<NodeType extends Node>(
  instance: Pick<
    ReactFlowInstance<NodeType>,
    "fitView" | "getNodes" | "getNodesBounds" | "getViewport" | "setViewport"
  >,
  options: FitViewOptions<NodeType>,
  occlusion: CanvasRightOcclusion | null
): Promise<boolean> {
  const didFit = await instance.fitView(options);
  const nodes = instance.getNodes();
  if (nodes.length === 0) return didFit;

  const fittedViewport = instance.getViewport();
  const viewport = alignViewportToCanvasLeft(
    fittedViewport,
    instance.getNodesBounds(nodes),
    occlusion
  );
  if (viewport !== fittedViewport) {
    await instance.setViewport(viewport);
  }

  return didFit;
}

export function areNodesMeasuredForFit(
  expectedNodeCount: number,
  nodes: readonly MeasuredNode[]
): boolean {
  return (
    expectedNodeCount > 0
    && nodes.length >= expectedNodeCount
    && nodes.every(
      (node) =>
        Number.isFinite(node.measured?.width)
        && Number.isFinite(node.measured?.height)
        && (node.measured?.width ?? 0) > 0
        && (node.measured?.height ?? 0) > 0
    )
  );
}

export function runInitialCanvasFit<NodeType extends Node>({
  handledRef,
  occlusion,
  expectedNodeCount,
  nodes,
  fitViewOptions,
  fitView
}: {
  handledRef: { current: boolean };
  occlusion: CanvasRightOcclusion | null;
  expectedNodeCount: number;
  nodes: readonly NodeType[];
  fitViewOptions: FitViewOptions<NodeType>;
  fitView: (options: FitViewOptions<NodeType>) => unknown;
}): boolean {
  if (handledRef.current || !occlusion) return false;

  if (expectedNodeCount === 0) {
    handledRef.current = true;
    return false;
  }

  if (!areNodesMeasuredForFit(expectedNodeCount, nodes)) return false;

  handledRef.current = true;
  fitView(fitViewOptions);
  return true;
}

function rightPaddingForOcclusion({
  inset,
  viewportWidth
}: CanvasRightOcclusion): number {
  if (!Number.isFinite(inset) || !Number.isFinite(viewportWidth)) {
    return SIDE_PADDING;
  }

  const safeViewportWidth = Math.max(0, Math.floor(viewportWidth));
  const safeInset = Math.min(safeViewportWidth, Math.max(0, Math.ceil(inset)));
  const requestedPadding = Math.max(
    SIDE_PADDING,
    safeInset + OCCLUSION_GUTTER
  );
  const maximumPadding = Math.max(
    0,
    safeViewportWidth - SIDE_PADDING - 1
  );

  return Math.min(requestedPadding, maximumPadding);
}

function usableCanvasRightEdge({
  inset,
  viewportWidth
}: CanvasRightOcclusion): number {
  if (
    !Number.isFinite(inset)
    || !Number.isFinite(viewportWidth)
    || viewportWidth <= 0
  ) {
    return Number.NaN;
  }

  return Math.max(
    SIDE_PADDING,
    viewportWidth - Math.max(0, inset) - OCCLUSION_GUTTER
  );
}
