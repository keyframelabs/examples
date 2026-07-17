import { PersonaView } from "@keyframelabs/elements";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronRight,
  GripHorizontal,
  Loader2,
  Maximize2,
  Minus,
  MoveDiagonal,
  Phone,
  PhoneOff
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
import {
  createLiveSession,
  type InterviewPacket,
  type LiveSessionResponse
} from "@/lib/api";
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
  hasLiveVideoTrack,
  isMissingUserCameraError,
  requestUserCamera,
  setMediaStreamVideoEnabled,
  stopMediaStream,
  userCameraErrorMessage
} from "@/utils/interview/userCamera";

type InterviewStage = "introduction" | "canvas";

export type InterviewStartup = {
  cameraRequest: Promise<MediaStream>;
  liveSessionRequest: Promise<LiveSessionResponse>;
};

type FloatingAvatarWindowProps = {
  canvasText: string;
  packet: InterviewPacket;
  startup: InterviewStartup;
  stage: InterviewStage;
  onEnterCanvas: () => void;
  onReturnToSelection: () => void;
  onCanvasSyncStatusChange?: (status: CanvasSyncStatus) => void;
};

type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "unavailable"
  | "off";

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
  packet,
  startup,
  stage,
  onEnterCanvas,
  onReturnToSelection,
  onCanvasSyncStatusChange
}: FloatingAvatarWindowProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const personaContainerRef = useRef<HTMLDivElement | null>(null);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const userCameraStreamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<PersonaViewRuntime | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
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
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [hasEndedCall, setHasEndedCall] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [canvasSyncStatus, setCanvasSyncStatus] = useState<CanvasSyncStatus>(
    INITIAL_CANVAS_SYNC_STATUS
  );
  const showConnectionLog = shouldShowConnectionLog();
  const isCameraOn = cameraStatus === "ready";
  const isCameraChanging = cameraStatus === "requesting";
  const cameraToggleLabel = isCameraChanging
    ? "Turning on camera"
    : isCameraOn
      ? "Turn off camera"
      : "Turn on camera";
  const isLyraChanging = isConnecting || isEndingCall;
  const lyraToggleLabel = isEndingCall
    ? "Turning off Lyra"
    : isConnecting
      ? "Turning on Lyra"
      : isConnected
        ? "Turn off Lyra"
        : "Turn on Lyra";

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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
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
    const frame = window.requestAnimationFrame(() => {
      void joinInterview(startup);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [startup]);

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

  async function connect(
    liveSessionRequest = createLiveSession(packet.packetId)
  ) {
    setAvatarError(null);
    setHasEndedCall(false);
    setEvents([]);
    setIsConnecting(true);
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    lastLoggedContextVersionRef.current = 0;
    lastLoggedContextErrorRef.current = null;

    try {
      await cleanupRuntime();
      const liveSession = await liveSessionRequest;
      if (!isMountedRef.current) return;
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
          showAvatarError(`Lyra error: ${error.message}`);
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
      if (!isMountedRef.current) return;
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
      if (!isMountedRef.current) return;
      try {
        await cleanupRuntime();
      } catch (cleanupError) {
        console.error(
          "Failed to clean up Lyra after connection error.",
          cleanupError
        );
      }
      showAvatarError(formatAvatarError(error));
      setIsConnected(false);
      setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    } finally {
      if (isMountedRef.current) setIsConnecting(false);
    }
  }

  async function enableCamera(cameraRequest?: Promise<MediaStream>) {
    setCameraError(null);
    setCameraStatus("requesting");

    try {
      const existingStream = userCameraStreamRef.current;
      if (hasLiveVideoTrack(existingStream)) {
        setMediaStreamVideoEnabled(existingStream, true);
        setCameraStream(existingStream);
        setCameraStatus("ready");
        return;
      }

      if (existingStream) {
        stopMediaStream(existingStream);
        userCameraStreamRef.current = null;
        setCameraStream(null);
      }

      const stream = await (cameraRequest ?? requestUserCamera());
      if (!isMountedRef.current) {
        stopMediaStream(stream);
        return;
      }
      setMediaStreamVideoEnabled(stream, true);
      const previousStream = userCameraStreamRef.current;
      userCameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus("ready");
      if (previousStream !== stream) stopMediaStream(previousStream);
    } catch (error) {
      if (!isMountedRef.current) return;
      setCameraStatus("unavailable");
      if (isMissingUserCameraError(error)) {
        setCameraError(null);
      } else {
        showCameraError(userCameraErrorMessage(error));
      }
    }
  }

  async function joinInterview(initialStartup?: InterviewStartup) {
    const tasks: Promise<void>[] = [];
    if (cameraStatus !== "ready") {
      tasks.push(enableCamera(initialStartup?.cameraRequest));
    }
    if (!isConnected) {
      tasks.push(connect(initialStartup?.liveSessionRequest));
    }
    await Promise.allSettled(tasks);
  }

  function disableCamera() {
    const stream = userCameraStreamRef.current;
    if (stream) setMediaStreamVideoEnabled(stream, false);
    setCameraStatus("off");
    setCameraError(null);
  }

  function toggleCamera() {
    if (isCameraOn) {
      disableCamera();
      return;
    }

    void enableCamera();
  }

  async function disconnectLyra() {
    setAvatarError(null);
    setHasEndedCall(true);
    setIsEndingCall(true);

    try {
      await cleanupRuntime();
    } catch (error) {
      showAvatarError(
        `Could not cleanly end the call: ${formatAvatarError(error)}`
      );
    } finally {
      if (isMountedRef.current) setIsEndingCall(false);
    }
  }

  function toggleLyra() {
    if (isConnected) {
      void disconnectLyra();
      return;
    }

    void connect();
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
    showAvatarError(message);
    void cleanupRuntime().catch((error) => {
      showAvatarError(`${message} ${formatAvatarError(error)}`);
    });
  }

  function showAvatarError(message: string) {
    setAvatarError(message);
    setMinimized(false);
  }

  function showCameraError(message: string) {
    setCameraError(message);
    setMinimized(false);
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
                  size="sm"
                  className="h-7 px-2"
                  onClick={onReturnToSelection}
                >
                  <ArrowLeft className="size-3.5" />
                  Interview packets
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                End interview and choose another packet
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Card>
      ) : null}

      <div
        className={cn(
          "fixed z-40",
          intro
            ? "inset-0 overflow-y-auto bg-canvas-paper px-4 sm:px-6 lg:px-8"
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
            "mx-auto grid min-h-full w-full max-w-7xl grid-rows-[1fr_auto_1fr] border-x border-border/50 px-3 py-4 sm:px-5 sm:py-5 lg:px-8"
          )}
        >
          {intro ? (
            <div className="mb-3 translate-y-0 self-end text-center sm:-translate-y-15">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Ace your next system design interview
              </h1>
              <p className="mx-auto mt-3 max-w-2xl font-sans text-sm leading-6 text-muted-foreground sm:text-base">
                Practice {packet.title} with Lyra
              </p>
              {!isConnected && !avatarError ? (
                <p
                  className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground"
                  role="status"
                >
                  Allow camera and microphone access when your browser asks.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={onReturnToSelection}
              >
                Choose a different packet
              </Button>
            </div>
          ) : null}

          <Card
            key="interview-media-card"
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
              "group relative flex flex-col overflow-hidden bg-card text-card-foreground shadow-xl",
              intro
                ? "mx-auto w-full max-w-[814px] translate-y-0 rounded-xl border-border/80 sm:translate-y-8"
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
                      <div
                        className="relative z-10 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground shadow-lg"
                        role="status"
                      >
                        {cameraStatus === "requesting" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {cameraStatus === "requesting"
                          ? "Waiting for camera permission"
                          : cameraStatus === "unavailable"
                            ? "Camera unavailable"
                            : cameraStatus === "off"
                              ? "Camera off"
                              : "Preparing camera"}
                      </div>
                    </div>
                  ) : null}
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                          aria-label={cameraToggleLabel}
                          aria-pressed={isCameraOn}
                          disabled={isCameraChanging}
                          onClick={toggleCamera}
                        >
                          {isCameraChanging ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isCameraOn ? (
                            <CameraOff className="size-4" />
                          ) : (
                            <Camera className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {cameraToggleLabel}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                      <div
                        className="relative z-10 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground shadow-lg"
                        role="status"
                      >
                        {isConnecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {avatarError
                          ? "Lyra is unavailable"
                          : isConnecting
                            ? "Lyra is joining"
                            : hasEndedCall
                              ? "Call ended"
                              : "Preparing Lyra"}
                      </div>
                    </div>
                  ) : null}
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                          aria-label={lyraToggleLabel}
                          aria-pressed={isConnected}
                          disabled={isLyraChanging}
                          onClick={toggleLyra}
                        >
                          {isLyraChanging ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isConnected ? (
                            <PhoneOff className="size-4" />
                          ) : (
                            <Phone className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {lyraToggleLabel}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                <Button
                  type="button"
                  className="w-full font-semibold"
                  onClick={
                    isConnected
                      ? onEnterCanvas
                      : () => void joinInterview()
                  }
                  disabled={
                    !isConnected &&
                    (!avatarError ||
                      isConnecting ||
                      cameraStatus === "requesting")
                  }
                >
                  {!isConnected && !avatarError ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {isConnected
                    ? "Open design canvas"
                    : avatarError
                      ? "Retry interview"
                      : "Starting interview"}
                  {isConnected ? <ChevronRight className="size-4" /> : null}
                </Button>
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
