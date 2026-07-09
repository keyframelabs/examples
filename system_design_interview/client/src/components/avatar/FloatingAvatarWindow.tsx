import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertCircle,
  GripHorizontal,
  Loader2,
  Maximize2,
  Mic,
  Minus,
  PhoneOff,
  RadioTower
} from "lucide-react";
import { Alert, AlertDescription } from "@kfl-system-design/ui/components/alert";
import { Badge } from "@kfl-system-design/ui/components/badge";
import { Button } from "@kfl-system-design/ui/components/button";
import { Card } from "@kfl-system-design/ui/components/card";
import { ScrollArea } from "@kfl-system-design/ui/components/scroll-area";
import { cn } from "@kfl-system-design/ui/lib/utils";
import { createLiveSession } from "@/lib/api";
import type { CanvasSyncStatus } from "@/types/canvas-sync-status";
import {
  createCanvasContextSync,
  type CanvasContextSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  attachPersonaTranscriptObserver,
  cleanupPersonaViewRuntime,
  type PersonaViewRuntime,
  sendPersonaContext
} from "@/utils/avatar/personaViewRuntime";

export type { CanvasSyncStatus } from "@/types/canvas-sync-status";

type FloatingAvatarWindowProps = {
  canvasText: string;
  onCanvasSyncStatusChange?: (status: CanvasSyncStatus) => void;
};

type Position = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startClient: Position;
  startPosition: Position;
};

const PANEL_WIDTH = 392;
const PANEL_HEIGHT = 500;
const MINIMIZED_WIDTH = 260;
const MINIMIZED_HEIGHT = 56;

type PersonaElementsModule = typeof import("@keyframelabs/elements");

let personaElementsPromise: Promise<PersonaElementsModule> | null = null;

export function FloatingAvatarWindow({
  canvasText,
  onCanvasSyncStatusChange
}: FloatingAvatarWindowProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<PersonaViewRuntime | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestCanvasTextRef = useRef(canvasText);
  const contextSyncReadyRef = useRef(false);
  const lastLoggedContextVersionRef = useRef(0);
  const lastLoggedContextErrorRef = useRef<string | null>(null);
  const [position, setPosition] = useState<Position>(() => initialPosition(PANEL_WIDTH, PANEL_HEIGHT));
  const [minimized, setMinimized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [contextSyncReady, setContextSyncReady] = useState(false);
  const [lastContextSentAt, setLastContextSentAt] = useState<number | null>(null);
  const [lastContextVersion, setLastContextVersion] = useState(0);
  const [contextSending, setContextSending] = useState(false);
  const [pendingContextEdits, setPendingContextEdits] = useState(0);
  const [contextSyncError, setContextSyncError] = useState<string | null>(null);
  const showConnectionLog = shouldShowConnectionLog();
  const contextPending = contextSending || pendingContextEdits > 0;

  useEffect(() => {
    latestCanvasTextRef.current = canvasText;
    const runtime = runtimeRef.current;
    if (!runtime || !contextSyncReadyRef.current) {
      return;
    }

    runtime.contextSync.push(canvasText);
  }, [canvasText]);

  useEffect(() => {
    onCanvasSyncStatusChange?.({
      isReady: contextSyncReady,
      isSending: contextSending,
      pendingEdits: pendingContextEdits,
      lastSentAt: lastContextSentAt,
      lastSentVersion: lastContextVersion,
      error: contextSyncError
    });
  }, [
    contextSending,
    contextSyncError,
    contextSyncReady,
    lastContextSentAt,
    lastContextVersion,
    onCanvasSyncStatusChange,
    pendingContextEdits
  ]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      void cleanupRuntime().catch((err) => {
        console.error("Failed to clean up live interviewer.", err);
      });
    };
  }, []);

  useEffect(() => {
    const panelSize = getPanelSize();
    setPosition((current) => clampPosition(
      current,
      panelSize.width,
      panelSize.height
    ));
  }, [minimized]);

  useEffect(() => {
    function handleResize() {
      const panelSize = getPanelSize();
      setPosition((current) => clampPosition(current, panelSize.width, panelSize.height));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function connect() {
    setError(null);
    setEvents([]);
    setIsConnecting(true);
    setContextSyncError(null);
    setLastContextSentAt(null);
    setLastContextVersion(0);
    setContextSending(false);
    setPendingContextEdits(0);
    lastLoggedContextVersionRef.current = 0;
    lastLoggedContextErrorRef.current = null;

    try {
      await cleanupRuntime();
      setContextSyncReadyValue(false);
      const personaElementsModulePromise = loadPersonaElements();
      const liveSessionPromise = createLiveSession();
      const [liveSession, { PersonaView }] = await Promise.all([
        liveSessionPromise,
        personaElementsModulePromise
      ]);
      const container = containerRef.current;
      if (!container) {
        throw new Error("Avatar container is not ready.");
      }

      clearContainer(container);
      const closeState = { expected: false, disconnectHandled: false };
      let connectError: string | null = null;
      const view = new PersonaView({
        container,
        sessionDetails: liveSession.sessionDetails,
        voiceAgentDetails: liveSession.voiceAgentDetails,
        videoFit: "contain",
        onStateChange: (nextStatus) => {
          logEvent(`PersonaView state: ${nextStatus}`);
          setIsConnecting(nextStatus === "connecting");
          setIsConnected(nextStatus === "connected");
        },
        onAgentStateChange: (nextStatus) => {
          logEvent(`Avatar playback: ${nextStatus}`);
        },
        onDisconnect: () => {
          logEvent("Live interviewer disconnected");
          if (closeState.expected || closeState.disconnectHandled) {
            return;
          }

          closeState.disconnectHandled = true;
          handleUnexpectedDisconnect("Live interviewer disconnected.");
        },
        onError: (err) => {
          connectError = err.message;
          logEvent(`PersonaView error: ${err.message}`);
          setError(`Live interviewer error: ${err.message}`);
        }
      });
      const contextSync = createCanvasContextSync({
        sendContextUpdate: (text) => {
          sendPersonaContext(view, text);
        },
        onStatusChange: handleCanvasContextSyncStatus
      });

      runtimeRef.current = {
        view,
        contextSync,
        detachTranscriptObserver: () => undefined,
        closeState
      };

      logEvent("Connecting live interviewer");
      await view.connect();
      if (view.status !== "connected") {
        throw new Error(connectError ?? "Live interviewer failed to connect.");
      }

      const runtime = runtimeRef.current;
      if (runtime?.view === view) {
        runtime.detachTranscriptObserver = attachPersonaTranscriptObserver(view, (transcript) => {
          if (transcript.isFinal && transcript.text.trim()) {
            logEvent(`Transcript received: ${transcript.role}`);
          }
        });
      }

      setContextSyncReadyValue(true);
      contextSync.push(latestCanvasTextRef.current);
      contextSync.start();
      logEvent("Canvas context sync started");

      setIsConnected(true);
      logEvent("Live interviewer connected");
    } catch (err) {
      try {
        await cleanupRuntime();
      } catch (cleanupErr) {
        console.error("Failed to clean up live interviewer after connection error.", cleanupErr);
      }
      setError(formatError(err));
      setIsConnected(false);
      setContextSending(false);
      setPendingContextEdits(0);
    } finally {
      setIsConnecting(false);
    }
  }

  async function endCall() {
    setError(null);
    try {
      await cleanupRuntime();
    } catch (err) {
      setError(`Could not cleanly end the live interviewer: ${formatError(err)}`);
    }
  }

  async function cleanupRuntime() {
    const inFlightCleanup = cleanupPromiseRef.current;
    if (inFlightCleanup) {
      await inFlightCleanup;
      return;
    }

    const runtime = runtimeRef.current;
    setContextSyncReadyValue(false);
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
    setContextSending(false);
    setPendingContextEdits(0);
    setContextSyncError(null);
    setLastContextSentAt(null);
    setLastContextVersion(0);
    lastLoggedContextVersionRef.current = 0;
    lastLoggedContextErrorRef.current = null;
  }

  function handleCanvasContextSyncStatus(status: CanvasContextSyncStatus) {
    setContextSending(status.isSending);
    setPendingContextEdits(status.pendingEdits);
    setLastContextSentAt(status.lastSentAt);
    setLastContextVersion(status.lastSentVersion);
    setContextSyncError(status.error);

    if (status.error && status.error !== lastLoggedContextErrorRef.current) {
      lastLoggedContextErrorRef.current = status.error;
      logEvent(`Canvas context sync failed: ${status.error}`);
    }
    if (!status.error) {
      lastLoggedContextErrorRef.current = null;
    }

    if (status.lastSentVersion > lastLoggedContextVersionRef.current) {
      lastLoggedContextVersionRef.current = status.lastSentVersion;
      logEvent("Canvas context sent");
    }
  }

  function handleUnexpectedDisconnect(message: string) {
    setError(message);
    void cleanupRuntime().catch((err) => {
      setError(`${message} ${formatError(err)}`);
    });
  }

  function logEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setEvents((current) => [...current.slice(-7), `${timestamp} ${message}`]);
  }

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

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

  function handleHeaderPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
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

  function updateDragPosition(pointerId: number, clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) {
      return;
    }

    const next = {
      x: drag.startPosition.x + clientX - drag.startClient.x,
      y: drag.startPosition.y + clientY - drag.startClient.y
    };
    const panelSize = getPanelSize();
    setPosition(clampPosition(next, panelSize.width, panelSize.height));
  }

  function endDrag(pointerId: number) {
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
    }
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    window.removeEventListener("pointercancel", handleWindowPointerEnd);
  }

  const statusText = isConnected
    ? "Live"
    : isConnecting
      ? "Connecting"
      : error
        ? "Attention"
        : "Ready";
  const subtitle = isConnected
    ? contextPending
      ? "Syncing"
      : lastContextSentAt
        ? "Synced"
        : "Live interview"
    : "System design interviewer";

  return (
    <div
      className="fixed left-0 top-0 z-40"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <Card
        ref={panelRef}
        className={cn(
          minimized
            ? "w-[min(260px,calc(100vw-24px))]"
            : "w-[min(392px,calc(100vw-24px))]",
          "overflow-hidden rounded-lg bg-card text-card-foreground shadow-float"
        )}
      >
        <div
          className="flex h-12 cursor-move touch-none items-center gap-2 border-b border-border bg-foreground px-3 text-background"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
        >
          <GripHorizontal className="size-4 shrink-0 text-background/55" />
          <RadioTower className="size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold">Lyra</div>
              <Badge
                variant={error ? "destructive" : isConnected ? "default" : "secondary"}
                className="h-5 shrink-0 px-1.5 py-0 text-[10px]"
              >
                {statusText}
              </Badge>
            </div>
            <div className="truncate text-[11px] text-background/60">{subtitle}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-background/80 hover:bg-background/10 hover:text-background"
            aria-label={minimized ? "Restore avatar window" : "Minimize avatar window"}
            title={minimized ? "Restore" : "Minimize"}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={() => setMinimized((current) => !current)}
          >
            {minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}
          </Button>
        </div>

        {!minimized ? (
          <div className="grid gap-3 p-3">
            <div className="relative aspect-square min-h-[300px] overflow-hidden rounded-md bg-canvas-avatar-surface">
              <div ref={containerRef} className="h-full w-full overflow-hidden" />
              {!isConnected ? (
                <div className="absolute inset-0 grid place-items-center px-5 text-center">
                  <div>
                    <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-background/10 text-background">
                      <Mic className="size-5" />
                    </div>
                    <p className="text-sm font-medium text-background">Live interviewer</p>
                    <p className="mt-1 text-xs text-background/60">System design interview</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 font-semibold"
                onMouseEnter={preloadPersonaElements}
                onFocus={preloadPersonaElements}
                onClick={() => {
                  void connect();
                }}
                disabled={isConnecting || isConnected}
              >
                {isConnecting ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
                Start
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 font-semibold"
                onClick={() => {
                  void endCall();
                }}
                disabled={!isConnected && !runtimeRef.current}
              >
                <PhoneOff className="size-4" />
                End
              </Button>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {showConnectionLog && events.length > 0 ? (
              <ScrollArea className="h-28 rounded-md border bg-muted text-xs text-muted-foreground">
                <div className="p-2">
                  {events.map((event) => (
                    <div key={event}>{event}</div>
                  ))}
                </div>
              </ScrollArea>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );

  function getPanelSize(): { width: number; height: number } {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { width: rect.width, height: rect.height };
    }

    return minimized
      ? { width: MINIMIZED_WIDTH, height: MINIMIZED_HEIGHT }
      : { width: PANEL_WIDTH, height: PANEL_HEIGHT };
  }

  function setContextSyncReadyValue(nextReady: boolean) {
    contextSyncReadyRef.current = nextReady;
    setContextSyncReady(nextReady);
  }
}

function loadPersonaElements(): Promise<PersonaElementsModule> {
  personaElementsPromise ??= import("@keyframelabs/elements").catch((err) => {
    personaElementsPromise = null;
    throw err;
  });
  return personaElementsPromise;
}

function preloadPersonaElements(): void {
  void loadPersonaElements().catch(() => undefined);
}

function clearContainer(container: HTMLElement) {
  while (container.firstChild) {
    container.firstChild.remove();
  }
}

function shouldShowConnectionLog(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("cli") || window.location.hash.toLowerCase().includes("cli");
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "Could not connect the live avatar.";
}

function initialPosition(width: number, height: number): Position {
  if (typeof window === "undefined") {
    return { x: 24, y: 24 };
  }

  return clampPosition({
    x: window.innerWidth - width - 24,
    y: 24
  }, width, height);
}

function clampPosition(position: Position, width: number, height: number): Position {
  if (typeof window === "undefined") {
    return position;
  }

  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, margin, maxY)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
