import { PersonaView } from "@keyframelabs/elements";
import {
  AlertCircle,
  CameraOff,
  ChevronRight,
  GripHorizontal,
  Loader2,
  Maximize2,
  Mic,
  Minus,
  MoveDiagonal,
  PhoneOff,
  X
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import personSharpUrl from "@/assets/person-sharp.svg";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { createLiveSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  createCanvasContextSync,
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  attachPersonaTranscriptObserver,
  cleanupPersonaViewRuntime,
  type PersonaViewRuntime,
  sendPersonaContext
} from "@/utils/avatar/personaViewRuntime";
import {
  requestUserCamera,
  stopMediaStream,
  userCameraErrorMessage
} from "@/utils/interview/userCamera";

type InterviewStage = "introduction" | "canvas";

type FloatingAvatarWindowProps = {
  canvasText: string;
  stage: InterviewStage;
  onEnterCanvas: () => void;
  onReturnToIntroduction: () => void;
  onCanvasSyncStatusChange?: (status: CanvasSyncStatus) => void;
};

type CameraStatus = "idle" | "requesting" | "ready" | "unavailable";

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
const CANVAS_TOP_CONTROLS_BOUNDARY = 56;

export function FloatingAvatarWindow({
  canvasText,
  stage,
  onEnterCanvas,
  onReturnToIntroduction,
  onCanvasSyncStatusChange
}: FloatingAvatarWindowProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const personaContainerRef = useRef<HTMLDivElement | null>(null);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const userCameraStreamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<PersonaViewRuntime | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const latestCanvasTextRef = useRef(canvasText);
  const lastLoggedContextVersionRef = useRef(0);
  const lastLoggedContextErrorRef = useRef<string | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>(initialPanelSize);
  const [position, setPosition] = useState<Position>(() =>
    initialPosition(panelSize.width, panelSize.height)
  );
  const [minimized, setMinimized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [canvasSyncStatus, setCanvasSyncStatus] = useState<CanvasSyncStatus>(
    INITIAL_CANVAS_SYNC_STATUS
  );
  const showConnectionLog = shouldShowConnectionLog();

  useEffect(() => {
    latestCanvasTextRef.current = canvasText;
    const runtime = runtimeRef.current;
    if (!runtime?.contextSync.getStatus().isReady) return;

    runtime.contextSync.push(canvasText);
  }, [canvasText]);

  useEffect(() => {
    onCanvasSyncStatusChange?.(canvasSyncStatus);
  }, [canvasSyncStatus, onCanvasSyncStatusChange]);

  useEffect(() => {
    const video = userVideoRef.current;
    if (!video) return;

    video.srcObject = cameraStream;
    if (cameraStream) {
      void video.play().catch(() => {
        // The stream stays attached; browsers may begin playback after interaction.
      });
    }

    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    if (stage === "introduction") setMinimized(false);
  }, [stage]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      window.removeEventListener("pointermove", handleWindowResizePointerMove);
      window.removeEventListener("pointerup", handleWindowResizePointerEnd);
      window.removeEventListener("pointercancel", handleWindowResizePointerEnd);
      stopMediaStream(userCameraStreamRef.current);
      userCameraStreamRef.current = null;
      void cleanupRuntime().catch((error) => {
        console.error("Failed to clean up Lyra.", error);
      });
    };
  }, []);

  useEffect(() => {
    if (stage !== "canvas") return;

    const panelSize = getPanelSize();
    setPosition((current) =>
      clampPosition(current, panelSize.width, panelSize.height)
    );
  }, [minimized, stage]);

  useEffect(() => {
    function handleResize() {
      if (stage !== "canvas") return;

      const panelSize = getPanelSize();
      setPosition((current) =>
        clampPosition(current, panelSize.width, panelSize.height)
      );
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [minimized, stage]);

  async function connect() {
    setAvatarError(null);
    setEvents([]);
    setIsConnecting(true);
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    lastLoggedContextVersionRef.current = 0;
    lastLoggedContextErrorRef.current = null;

    try {
      await cleanupRuntime();
      const liveSession = await createLiveSession();
      const container = personaContainerRef.current;
      if (!container) throw new Error("Avatar container is not ready.");

      clearContainer(container);
      const closeState = { expected: false, disconnectHandled: false };
      let connectError: string | null = null;
      const view = new PersonaView({
        container,
        sessionDetails: liveSession.sessionDetails,
        voiceAgentDetails: liveSession.voiceAgentDetails,
        videoFit: "cover",
        onStateChange: (nextStatus) => {
          logEvent(`PersonaView state: ${nextStatus}`);
          setIsConnecting(nextStatus === "connecting");
          setIsConnected(nextStatus === "connected");
        },
        onAgentStateChange: (nextStatus) => {
          logEvent(`Avatar playback: ${nextStatus}`);
        },
        onDisconnect: () => {
          logEvent("Lyra disconnected");
          if (closeState.expected || closeState.disconnectHandled) return;

          closeState.disconnectHandled = true;
          handleUnexpectedDisconnect("Lyra disconnected.");
        },
        onError: (error) => {
          connectError = error.message;
          logEvent(`PersonaView error: ${error.message}`);
          setAvatarError(`Lyra error: ${error.message}`);
        }
      });
      const contextSync = createCanvasContextSync({
        sendContextUpdate: (text) => sendPersonaContext(view, text),
        onStatusChange: handleCanvasContextSyncStatus
      });

      runtimeRef.current = {
        view,
        contextSync,
        detachTranscriptObserver: () => undefined,
        closeState
      };

      logEvent("Connecting Lyra");
      await view.connect();
      if (view.status !== "connected") {
        throw new Error(connectError ?? "Lyra failed to connect.");
      }

      const runtime = runtimeRef.current;
      if (runtime?.view === view) {
        runtime.detachTranscriptObserver = attachPersonaTranscriptObserver(
          view,
          (transcript) => {
            if (transcript.isFinal && transcript.text.trim()) {
              logEvent(`Transcript received: ${transcript.role}`);
            }
          }
        );
      }

      contextSync.push(latestCanvasTextRef.current);
      contextSync.start();
      logEvent("Canvas context sync started");
      setIsConnected(true);
      logEvent("Lyra connected");
    } catch (error) {
      try {
        await cleanupRuntime();
      } catch (cleanupError) {
        console.error(
          "Failed to clean up Lyra after connection error.",
          cleanupError
        );
      }
      setAvatarError(formatAvatarError(error));
      setIsConnected(false);
      setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    } finally {
      setIsConnecting(false);
    }
  }

  async function enableCamera() {
    setCameraError(null);
    setCameraStatus("requesting");

    try {
      const stream = await requestUserCamera();
      const previousStream = userCameraStreamRef.current;
      userCameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus("ready");
      if (previousStream !== stream) stopMediaStream(previousStream);
    } catch (error) {
      setCameraStatus("unavailable");
      setCameraError(userCameraErrorMessage(error));
    }
  }

  function disconnectVideo() {
    stopMediaStream(userCameraStreamRef.current);
    userCameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStatus("idle");
    setCameraError(null);
  }

  async function joinInterview() {
    const tasks: Promise<void>[] = [];
    if (cameraStatus !== "ready") tasks.push(enableCamera());
    if (!isConnected) tasks.push(connect());
    await Promise.allSettled(tasks);
  }

  async function disconnectLyra() {
    setAvatarError(null);
    try {
      await cleanupRuntime();
    } catch (error) {
      setAvatarError(
        `Could not cleanly disconnect Lyra: ${formatAvatarError(error)}`
      );
    }
  }

  async function cleanupRuntime() {
    const inFlightCleanup = cleanupPromiseRef.current;
    if (inFlightCleanup) {
      await inFlightCleanup;
      return;
    }

    const runtime = runtimeRef.current;
    if (!runtime) {
      resetRuntimeState();
      return;
    }

    runtimeRef.current = null;
    const cleanupPromise = cleanupPersonaViewRuntime(runtime);
    cleanupPromiseRef.current = cleanupPromise;

    try {
      await cleanupPromise;
    } finally {
      if (cleanupPromiseRef.current === cleanupPromise) {
        cleanupPromiseRef.current = null;
      }
      resetRuntimeState();
    }
  }

  function resetRuntimeState() {
    setIsConnected(false);
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    lastLoggedContextVersionRef.current = 0;
    lastLoggedContextErrorRef.current = null;
  }

  function handleCanvasContextSyncStatus(status: CanvasSyncStatus) {
    setCanvasSyncStatus(status);

    if (status.error && status.error !== lastLoggedContextErrorRef.current) {
      lastLoggedContextErrorRef.current = status.error;
      logEvent(`Canvas context sync failed: ${status.error}`);
    }
    if (!status.error) lastLoggedContextErrorRef.current = null;

    if (status.lastSentVersion > lastLoggedContextVersionRef.current) {
      lastLoggedContextVersionRef.current = status.lastSentVersion;
      logEvent("Canvas context sent");
    }
  }

  function handleUnexpectedDisconnect(message: string) {
    setAvatarError(message);
    void cleanupRuntime().catch((error) => {
      setAvatarError(`${message} ${formatAvatarError(error)}`);
    });
  }

  function logEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setEvents((current) => [
      ...current.slice(-7),
      `${timestamp} ${message}`
    ]);
  }

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
    const panelSize = getPanelSize();
    setPosition(clampPosition(next, panelSize.width, panelSize.height));
  }

  function endDrag(pointerId: number) {
    if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    window.removeEventListener("pointercancel", handleWindowPointerEnd);
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
      Math.max(1, anchorRight - 12),
      Math.max(1, window.innerHeight - top - 12) * aspectRatio
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
    window.removeEventListener("pointermove", handleWindowResizePointerMove);
    window.removeEventListener("pointerup", handleWindowResizePointerEnd);
    window.removeEventListener("pointercancel", handleWindowResizePointerEnd);
  }

  const intro = stage === "introduction";

  return (
    <>
      {!intro ? (
        <Card className="fixed right-4 top-4 z-50 bg-card/95 p-1 backdrop-blur-sm">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label="Exit canvas and return to introduction"
                  onClick={onReturnToIntroduction}
                >
                  <X size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Exit canvas</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Card>
      ) : null}

      <div
        className={cn(
          "fixed z-40",
          intro
            ? "inset-0 overflow-y-auto bg-canvas-paper"
            : "left-0 top-0"
        )}
        style={
          intro
            ? undefined
            : { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
        }
      >
        <div
          className={cn(
            intro &&
            "mx-auto grid min-h-full w-full max-w-7xl grid-rows-[1fr_auto_1fr] px-3 py-4 sm:px-5 sm:py-5 lg:px-8"
          )}
        >
          {intro ? (
            <div className="mb-3 translate-y-0 self-end text-center sm:-translate-y-15">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Ace your next system design interview
              </h1>
              <p className="mx-auto mt-3 max-w-2xl font-body text-sm leading-6 text-muted-foreground sm:text-base">
                Practice designing tinyurl with Lyra
              </p>
            </div>
          ) : null}

          <Card
            ref={panelRef}
            style={
              !intro
                ? {
                    width: `${panelSize.width}px`,
                    height: minimized ? undefined : `${panelSize.height}px`
                  }
                : undefined
            }
            className={cn(
              "group relative flex flex-col overflow-hidden bg-card text-card-foreground shadow-float",
              intro
                ? "mx-auto w-full max-w-[814px] translate-y-0 rounded-2xl border-border/80 sm:translate-y-8"
                : minimized
                  ? "max-w-[calc(100vw-24px)] rounded-lg"
                  : "w-[min(404px,calc(100vw-24px))] max-w-[min(404px,calc(100vw-24px))] max-h-[calc(100vh-68px)] rounded-lg"
            )}
          >
            {!intro ? (
              <div
                className="flex h-9 cursor-move touch-none items-center border-b border-border bg-card px-2"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={handleHeaderPointerUp}
              >
                <GripHorizontal className="size-4 text-muted-foreground" />
                <div className="flex-1" />
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={
                          minimized
                            ? "Restore video window"
                            : "Minimize video window"
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setMinimized((current) => !current)}
                      >
                        {minimized ? (
                          <Maximize2 className="size-4" />
                        ) : (
                          <Minus className="size-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {minimized ? "Restore" : "Minimize"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}

            <div
              className={cn(
                !intro &&
                  !minimized &&
                  "flex min-h-0 flex-1 flex-col overflow-hidden"
              )}
            >
            <div
              className={cn(
                "grid items-center justify-items-center",
                intro
                  ? "gap-2 p-2 sm:grid-cols-2 sm:p-3"
                  : "min-h-0 flex-1 grid-rows-2 gap-1 p-1",
                minimized && !intro && "hidden"
              )}
            >
              <section
                className={cn(
                  "overflow-hidden rounded-xl border bg-muted/40",
                  intro
                    ? "order-1 w-full max-w-[386px]"
                    : "order-2 h-full max-h-full aspect-square w-auto max-w-full"
                )}
                aria-label="Your camera preview"
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-foreground",
                    intro ? "aspect-square" : "h-full w-full"
                  )}
                >
                  <video
                    ref={userVideoRef}
                    className={cn(
                      "h-full w-full scale-x-[-1] object-cover",
                      cameraStatus !== "ready" && "invisible"
                    )}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Your live camera preview"
                  />
                  {cameraStatus !== "ready" ? (
                    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas-avatar-surface">
                      <PersonPlaceholder />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="relative z-10 shadow-lg"
                        disabled={cameraStatus === "requesting"}
                        onClick={() => void enableCamera()}
                      >
                        {cameraStatus === "requesting" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {cameraStatus === "requesting"
                          ? "Requesting camera"
                          : cameraStatus === "unavailable"
                            ? "Retry camera"
                            : "Enable camera"}
                      </Button>
                    </div>
                  ) : null}
                  {cameraStatus === "ready" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                      aria-label="Disconnect video"
                      title="Disconnect video"
                      onClick={disconnectVideo}
                    >
                      <CameraOff className="size-4" />
                    </Button>
                  ) : null}
                  <div
                    className={cn(
                      "absolute bottom-2 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm",
                      intro ? "left-2" : "left-8"
                    )}
                  >
                    You
                  </div>
                </div>
              </section>

              <section
                className={cn(
                  "overflow-hidden rounded-xl border bg-muted/40",
                  intro
                    ? "order-2 w-full max-w-[386px]"
                    : "order-1 h-full max-h-full aspect-square w-auto max-w-full"
                )}
                aria-label="Lyra video"
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-canvas-avatar-surface",
                    intro ? "aspect-square" : "h-full w-full"
                  )}
                >
                  <div
                    ref={personaContainerRef}
                    className="h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
                  />
                  {!isConnected ? (
                    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas-avatar-surface">
                      <PersonPlaceholder />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="relative z-10 shadow-lg"
                        disabled={isConnecting}
                        onClick={() => void connect()}
                      >
                        {isConnecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {isConnecting ? "Lyra is joining" : "Connect Lyra"}
                      </Button>
                    </div>
                  ) : null}
                  {isConnected ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                      aria-label="Disconnect Lyra"
                      title="Disconnect Lyra"
                      onClick={() => void disconnectLyra()}
                    >
                      <PhoneOff className="size-4" />
                    </Button>
                  ) : null}
                  <div
                    className={cn(
                      "absolute bottom-2 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm",
                      intro ? "left-2" : "left-8"
                    )}
                  >
                    Lyra
                  </div>
                </div>
              </section>
            </div>

            {intro ? (
              <div className="border-t border-border p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {isConnected ? (
                    <Button
                      type="button"
                      className="flex-1 font-semibold"
                      onClick={onEnterCanvas}
                    >
                      Open design canvas
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="flex-1 font-semibold"
                      onClick={() => void joinInterview()}
                      disabled={isConnecting || cameraStatus === "requesting"}
                    >
                      {isConnecting || cameraStatus === "requesting" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Mic className="size-4" />
                      )}
                      Join interview
                    </Button>
                  )}
                  {!isConnected ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 font-semibold"
                      onClick={onEnterCanvas}
                    >
                      Open canvas without joining
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(avatarError || cameraError) && (!minimized || intro) ? (
              <div className="grid gap-2 border-t border-border p-3 sm:px-6">
                {avatarError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{avatarError}</AlertDescription>
                  </Alert>
                ) : null}
                {cameraError ? (
                  <Alert>
                    <CameraOff className="size-4" />
                    <AlertDescription>{cameraError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}

            {showConnectionLog && events.length > 0 && (!minimized || intro) ? (
              <div className="border-t border-border p-3 sm:px-6">
                <ScrollArea className="h-28 rounded-md border bg-muted text-xs text-muted-foreground">
                  <div className="p-2">
                    {events.map((event) => (
                      <div key={event}>{event}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
            </div>

            {!intro && !minimized ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="pointer-events-none absolute bottom-0 left-0 z-30 size-6 touch-none cursor-nesw-resize rounded-none rounded-tr-md bg-card/85 p-0 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                aria-label="Resize video window"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                onKeyDown={handleResizeKeyDown}
              >
                <MoveDiagonal className="size-3" />
              </Button>
            ) : null}
          </Card>
          {intro ? <div aria-hidden="true" /> : null}
        </div>
      </div>
    </>
  );

  function getPanelSize(): { width: number; height: number } {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { width: rect.width, height: rect.height };
    }

    return minimized
      ? { width: panelSize.width, height: MINIMIZED_HEIGHT }
      : panelSize;
  }
}

function PersonPlaceholder() {
  const maskImage = `url("${personSharpUrl}")`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-muted-foreground/70"
      style={{
        WebkitMaskImage: maskImage,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "cover",
        maskImage,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "cover"
      }}
    />
  );
}

function clearContainer(container: HTMLElement) {
  while (container.firstChild) container.firstChild.remove();
}

function shouldShowConnectionLog(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  return params.has("cli") || window.location.hash.toLowerCase().includes("cli");
}

function formatAvatarError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not connect Lyra.";
}

function initialPanelSize(): PanelSize {
  if (typeof window === "undefined") {
    return {
      width: INITIAL_PANEL_WIDTH,
      height: INITIAL_PANEL_WIDTH / PANEL_ASPECT_RATIO
    };
  }

  const maxWidth = Math.min(
    PANEL_WIDTH,
    Math.max(1, window.innerWidth - 24),
    Math.max(1, window.innerHeight - CANVAS_TOP_CONTROLS_BOUNDARY - 12) *
      PANEL_ASPECT_RATIO
  );
  const width = Math.min(INITIAL_PANEL_WIDTH, maxWidth);

  return { width, height: width / PANEL_ASPECT_RATIO };
}

function initialPosition(width: number, height: number): Position {
  if (typeof window === "undefined") {
    return { x: 24, y: CANVAS_TOP_CONTROLS_BOUNDARY };
  }

  return clampPosition(
    {
      x: window.innerWidth - width - 24,
      y: CANVAS_TOP_CONTROLS_BOUNDARY
    },
    width,
    height
  );
}

function clampPosition(
  position: Position,
  width: number,
  height: number
): Position {
  if (typeof window === "undefined") return position;

  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const minY = CANVAS_TOP_CONTROLS_BOUNDARY;
  const maxY = Math.max(minY, window.innerHeight - height - margin);

  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, minY, maxY)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
