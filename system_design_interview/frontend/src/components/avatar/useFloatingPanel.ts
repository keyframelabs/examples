import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

type Position = { x: number; y: number };
type PanelSize = { width: number; height: number };
type ViewportSize = { width: number; height: number };

type Gesture =
  | { kind: "drag"; pointerId: number; startClient: Position; startPosition: Position }
  | {
      kind: "resize";
      pointerId: number;
      startClient: Position;
      startPosition: Position;
      startSize: PanelSize;
      aspectRatio: number;
    };

const DEFAULT_PANEL_WIDTH = 320;
const DEFAULT_PANEL_HEIGHT = 640;
const MAX_PANEL_WIDTH = 404;
const MIN_PANEL_WIDTH = 240;
const MINIMIZED_HEIGHT = 40;
const VIEWPORT_MARGIN = 12;
const INITIAL_HORIZONTAL_INSET = VIEWPORT_MARGIN * 2;
// Keeps the panel below the canvas toolbar: 16px top + 50px tall + margin.
const PANEL_TOP_CLEARANCE = 78;

export function useFloatingPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>(initialPanelSize);
  const [position, setPosition] = useState<Position>(() =>
    initialPosition(panelSize.width, panelSize.height)
  );
  const [minimized, setMinimized] = useState(false);

  const layoutRef = useRef({ panelSize, minimized });
  layoutRef.current = { panelSize, minimized };

  function reconcilePanelLayout() {
    const viewport = getViewportSize();
    if (!viewport) return;

    const { panelSize: currentSize, minimized: isMinimized } =
      layoutRef.current;
    const nextSize = fitPanelSizeToViewport(currentSize, viewport);
    if (
      nextSize.width !== currentSize.width ||
      nextSize.height !== currentSize.height
    ) {
      setPanelSize(nextSize);
    }

    setPosition((current) =>
      clampPosition(
        current,
        nextSize.width,
        isMinimized ? MINIMIZED_HEIGHT : nextSize.height,
        viewport
      )
    );
  }

  useEffect(() => {
    reconcilePanelLayout();
  }, [minimized]);

  useEffect(() => {
    const handleResize = () => reconcilePanelLayout();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    gesture: Gesture
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = gesture;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (gesture.kind === "drag") {
      const next = {
        x: gesture.startPosition.x + event.clientX - gesture.startClient.x,
        y: gesture.startPosition.y + event.clientY - gesture.startClient.y
      };
      const size = measuredPanelSize();
      setPosition(clampPosition(next, size.width, size.height));
      return;
    }

    // Resize from the bottom-left handle: the panel is anchored at its
    // top-right corner and scales uniformly along the dominant axis.
    const widthScale =
      (gesture.startSize.width + gesture.startClient.x - event.clientX) /
      gesture.startSize.width;
    const heightScale =
      (gesture.startSize.height + event.clientY - gesture.startClient.y) /
      gesture.startSize.height;
    const scale =
      Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
        ? widthScale
        : heightScale;
    const anchorRight = gesture.startPosition.x + gesture.startSize.width;

    applyResize(
      gesture.startSize.width * scale,
      gesture.aspectRatio,
      anchorRight,
      gesture.startPosition.y
    );
  }

  const headerHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      handlePointerDown(event, {
        kind: "drag",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPosition: position
      });
    },
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp
  };

  const resizeHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (minimized || event.button !== 0) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;

      event.stopPropagation();
      handlePointerDown(event, {
        kind: "resize",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPosition: { x: rect.left, y: rect.top },
        startSize: { width: rect.width, height: rect.height },
        aspectRatio: rect.width / rect.height
      });
    },
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 16;
      const direction =
        event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowRight" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (direction === 0) return;

      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const aspectRatio = rect.width / rect.height;
      const widthStep =
        event.key === "ArrowUp" || event.key === "ArrowDown"
          ? step * aspectRatio
          : step;

      event.preventDefault();
      event.stopPropagation();
      applyResize(
        rect.width + direction * widthStep,
        aspectRatio,
        rect.right,
        rect.top
      );
    }
  };

  function applyResize(
    targetWidth: number,
    aspectRatio: number,
    anchorRight: number,
    top: number
  ) {
    const maxWidth = Math.min(
      MAX_PANEL_WIDTH,
      Math.max(1, anchorRight - VIEWPORT_MARGIN),
      Math.max(1, window.innerHeight - top - VIEWPORT_MARGIN) * aspectRatio
    );
    const width = clamp(targetWidth, Math.min(MIN_PANEL_WIDTH, maxWidth), maxWidth);
    const nextSize = { width, height: width / aspectRatio };

    setPanelSize(nextSize);
    setPosition(
      clampPosition(
        { x: anchorRight - nextSize.width, y: top },
        nextSize.width,
        nextSize.height
      )
    );
  }

  function measuredPanelSize(): PanelSize {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { width: rect.width, height: rect.height };
    }

    return minimized
      ? { width: panelSize.width, height: MINIMIZED_HEIGHT }
      : panelSize;
  }

  return {
    panelRef,
    panelSize,
    position,
    minimized,
    setMinimized,
    headerHandlers,
    resizeHandlers
  };
}

export function initialPanelSize(viewport = getViewportSize()): PanelSize {
  const preferred = {
    width: DEFAULT_PANEL_WIDTH,
    height: DEFAULT_PANEL_HEIGHT
  };
  return viewport ? fitPanelSizeToViewport(preferred, viewport) : preferred;
}

export function fitPanelSizeToViewport(
  size: PanelSize,
  viewport: ViewportSize
): PanelSize {
  const aspectRatio = size.width / size.height;
  const maxWidth = Math.min(
    MAX_PANEL_WIDTH,
    Math.max(1, viewport.width - INITIAL_HORIZONTAL_INSET),
    Math.max(1, viewport.height - PANEL_TOP_CLEARANCE - VIEWPORT_MARGIN) *
      aspectRatio
  );
  const width = clamp(size.width, Math.min(MIN_PANEL_WIDTH, maxWidth), maxWidth);

  return { width, height: width / aspectRatio };
}

export function initialPosition(
  width: number,
  height: number,
  viewport = getViewportSize()
): Position {
  if (!viewport) {
    return { x: INITIAL_HORIZONTAL_INSET, y: PANEL_TOP_CLEARANCE };
  }

  return clampPosition(
    {
      x: viewport.width - width - INITIAL_HORIZONTAL_INSET,
      y: PANEL_TOP_CLEARANCE
    },
    width,
    height,
    viewport
  );
}

export function clampPosition(
  position: Position,
  width: number,
  height: number,
  viewport = getViewportSize()
): Position {
  if (!viewport) return position;

  const maxX = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - width - VIEWPORT_MARGIN
  );
  const maxY = Math.max(
    PANEL_TOP_CLEARANCE,
    viewport.height - height - VIEWPORT_MARGIN
  );

  return {
    x: clamp(position.x, VIEWPORT_MARGIN, maxX),
    y: clamp(position.y, PANEL_TOP_CLEARANCE, maxY)
  };
}

function getViewportSize(): ViewportSize | undefined {
  if (typeof window === "undefined") return undefined;

  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
