import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

type InterviewStage = "introduction" | "canvas";

type Position = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startClient: Position;
  startPosition: Position;
};

type PanelSize = {
  width: number;
  height: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ResizeState = {
  pointerId: number;
  startClient: Position;
  startPosition: Position;
  startSize: PanelSize;
  aspectRatio: number;
};

const PANEL_WIDTH = 404;
const PANEL_HEIGHT = 816;
const PANEL_ASPECT_RATIO = PANEL_WIDTH / PANEL_HEIGHT;
const INITIAL_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 240;
const MINIMIZED_HEIGHT = 40;
const VIEWPORT_MARGIN = 12;
const INITIAL_HORIZONTAL_INSET = VIEWPORT_MARGIN * 2;
const CANVAS_TOP_CONTROLS_TOP = 16;
const CANVAS_TOP_CONTROLS_HEIGHT = 50;
const CANVAS_TOP_CONTROLS_BOTTOM =
  CANVAS_TOP_CONTROLS_TOP + CANVAS_TOP_CONTROLS_HEIGHT;
const CANVAS_TOP_CONTROLS_CLEARANCE =
  CANVAS_TOP_CONTROLS_BOTTOM + VIEWPORT_MARGIN;

export function useFloatingPanel(stage: InterviewStage) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const removeDragListenersRef = useRef<() => void>(() => undefined);
  const removeResizeListenersRef = useRef<() => void>(() => undefined);
  const [panelSize, setPanelSize] = useState<PanelSize>(initialPanelSize);
  const [position, setPosition] = useState<Position>(() =>
    initialPosition(panelSize.width, panelSize.height)
  );
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (stage === "introduction") setMinimized(false);
  }, [stage]);

  useEffect(() => {
    if (stage !== "canvas") return;

    reconcilePanelLayout();
  }, [minimized, stage]);

  useEffect(() => {
    function handleResize() {
      reconcilePanelLayout();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [minimized, panelSize]);

  useEffect(
    () => () => {
      removeDragListenersRef.current();
      removeResizeListenersRef.current();
    },
    []
  );

  function handleHeaderPointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (stage !== "canvas" || event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition: position
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    removeDragListenersRef.current = removeDragListeners;
  }

  function handleHeaderPointerMove(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    updateDragPosition(event.pointerId, event.clientX, event.clientY);
  }

  function handleHeaderPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    endDrag(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWindowPointerMove(event: PointerEvent) {
    updateDragPosition(event.pointerId, event.clientX, event.clientY);
  }

  function handleWindowPointerEnd(event: PointerEvent) {
    endDrag(event.pointerId);
  }

  function updateDragPosition(
    pointerId: number,
    clientX: number,
    clientY: number
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;

    const next = {
      x: drag.startPosition.x + clientX - drag.startClient.x,
      y: drag.startPosition.y + clientY - drag.startClient.y
    };
    const currentPanelSize = getPanelSize();
    setPosition(
      clampPosition(next, currentPanelSize.width, currentPanelSize.height)
    );
  }

  function endDrag(pointerId: number) {
    if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
    removeDragListeners();
  }

  function removeDragListeners() {
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    window.removeEventListener("pointercancel", handleWindowPointerEnd);
    removeDragListenersRef.current = () => undefined;
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (stage !== "canvas" || minimized || event.button !== 0) return;

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition: { x: rect.left, y: rect.top },
      startSize: { width: rect.width, height: rect.height },
      aspectRatio: rect.width / rect.height
    };
    window.addEventListener("pointermove", handleWindowResizePointerMove);
    window.addEventListener("pointerup", handleWindowResizePointerEnd);
    window.addEventListener("pointercancel", handleWindowResizePointerEnd);
    removeResizeListenersRef.current = removeResizeListeners;
  }

  function handleResizePointerMove(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    updatePanelSize(event.pointerId, event.clientX, event.clientY);
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    endResize(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWindowResizePointerMove(event: PointerEvent) {
    updatePanelSize(event.pointerId, event.clientX, event.clientY);
  }

  function handleWindowResizePointerEnd(event: PointerEvent) {
    endResize(event.pointerId);
  }

  function updatePanelSize(
    pointerId: number,
    clientX: number,
    clientY: number
  ) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== pointerId) return;

    const widthScale =
      (resize.startSize.width + resize.startClient.x - clientX) /
      resize.startSize.width;
    const heightScale =
      (resize.startSize.height + clientY - resize.startClient.y) /
      resize.startSize.height;
    const scale =
      Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
        ? widthScale
        : heightScale;

    const anchorRight = resize.startPosition.x + resize.startSize.width;
    const nextSize = getClampedPanelSize(
      resize.startSize.width * scale,
      resize.aspectRatio,
      anchorRight,
      resize.startPosition.y
    );
    setPanelSize(nextSize);
    setPosition(
      clampPosition(
        {
          x: anchorRight - nextSize.width,
          y: resize.startPosition.y
        },
        nextSize.width,
        nextSize.height
      )
    );
  }

  function handleResizeKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
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
    const nextSize = getClampedPanelSize(
      rect.width + direction * widthStep,
      aspectRatio,
      rect.right,
      rect.top
    );
    setPanelSize(nextSize);
    setPosition(
      clampPosition(
        { x: rect.right - nextSize.width, y: rect.top },
        nextSize.width,
        nextSize.height
      )
    );
  }

  function getClampedPanelSize(
    targetWidth: number,
    aspectRatio: number,
    anchorRight: number,
    top: number
  ): PanelSize {
    const maxWidth = Math.min(
      PANEL_WIDTH,
      Math.max(1, anchorRight - VIEWPORT_MARGIN),
      Math.max(1, window.innerHeight - top - VIEWPORT_MARGIN) * aspectRatio
    );
    const width = clamp(
      targetWidth,
      Math.min(MIN_PANEL_WIDTH, maxWidth),
      maxWidth
    );

    return {
      width,
      height: width / aspectRatio
    };
  }

  function endResize(pointerId: number) {
    if (resizeRef.current?.pointerId === pointerId) resizeRef.current = null;
    removeResizeListeners();
  }

  function removeResizeListeners() {
    window.removeEventListener("pointermove", handleWindowResizePointerMove);
    window.removeEventListener("pointerup", handleWindowResizePointerEnd);
    window.removeEventListener("pointercancel", handleWindowResizePointerEnd);
    removeResizeListenersRef.current = () => undefined;
  }

  function getPanelSize(): PanelSize {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { width: rect.width, height: rect.height };
    }

    return minimized
      ? { width: panelSize.width, height: MINIMIZED_HEIGHT }
      : panelSize;
  }

  function reconcilePanelLayout() {
    const viewport = getViewportSize();
    if (!viewport) return;

    const nextPanelSize = fitPanelSizeToViewport(panelSize, viewport);
    if (
      nextPanelSize.width !== panelSize.width ||
      nextPanelSize.height !== panelSize.height
    ) {
      setPanelSize(nextPanelSize);
    }

    setPosition((current) =>
      clampPosition(
        current,
        nextPanelSize.width,
        minimized ? MINIMIZED_HEIGHT : nextPanelSize.height,
        viewport
      )
    );
  }

  return {
    panelRef,
    panelSize,
    position,
    minimized,
    setMinimized,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerUp,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizeKeyDown
  };
}

export function initialPanelSize(viewport = getViewportSize()): PanelSize {
  const preferredSize = {
    width: INITIAL_PANEL_WIDTH,
    height: INITIAL_PANEL_WIDTH / PANEL_ASPECT_RATIO
  };

  if (!viewport) {
    return preferredSize;
  }

  return fitPanelSizeToViewport(preferredSize, viewport);
}

export function fitPanelSizeToViewport(
  size: PanelSize,
  viewport: ViewportSize
): PanelSize {
  const aspectRatio = size.width / size.height;
  const maxWidth = Math.min(
    PANEL_WIDTH,
    Math.max(1, viewport.width - INITIAL_HORIZONTAL_INSET),
    Math.max(
      1,
      viewport.height - CANVAS_TOP_CONTROLS_CLEARANCE - VIEWPORT_MARGIN
    ) *
      aspectRatio
  );
  const width = clamp(
    size.width,
    Math.min(MIN_PANEL_WIDTH, maxWidth),
    maxWidth
  );

  return { width, height: width / aspectRatio };
}

export function initialPosition(
  width: number,
  height: number,
  viewport = getViewportSize()
): Position {
  if (!viewport) {
    return {
      x: INITIAL_HORIZONTAL_INSET,
      y: CANVAS_TOP_CONTROLS_CLEARANCE
    };
  }

  return clampPosition(
    {
      x: viewport.width - width - INITIAL_HORIZONTAL_INSET,
      y: CANVAS_TOP_CONTROLS_CLEARANCE
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
  const minY = CANVAS_TOP_CONTROLS_CLEARANCE;
  const maxY = Math.max(
    minY,
    viewport.height - height - VIEWPORT_MARGIN
  );

  return {
    x: clamp(position.x, VIEWPORT_MARGIN, maxX),
    y: clamp(position.y, minY, maxY)
  };
}

function getViewportSize(): ViewportSize | undefined {
  if (typeof window === "undefined") return undefined;

  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
