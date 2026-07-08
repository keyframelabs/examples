import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PersonaView } from "@keyframelabs/elements";
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
import { createLiveSession } from "../../lib/api";
import {
  createCanvasContextSync,
  type CanvasContextSync,
  type CanvasContextSyncStatus
} from "./canvasContextSync";
import {
  attachPersonaTranscriptObserver,
  sendPersonaContext
} from "./personaViewRuntime";

type FloatingAvatarWindowProps = {
  canvasText: string;
  onCanvasSyncStatusChange?: (status: CanvasSyncStatus) => void;
};

export type CanvasSyncStatus = {
  isReady: boolean;
  isSending: boolean;
  pendingEdits: number;
  lastSentAt: number | null;
  lastSentVersion: number;
  error: string | null;
};

type ActiveRuntime = {
  view: PersonaView;
  contextSync: CanvasContextSync;
  detachTranscriptObserver: () => void;
  closeState: {
    expected: boolean;
    disconnectHandled: boolean;
  };
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

export function FloatingAvatarWindow({
  canvasText,
  onCanvasSyncStatusChange
}: FloatingAvatarWindowProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ActiveRuntime | null>(null);
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
      cleanupRuntime();
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
      cleanupRuntime();
      setContextSyncReadyValue(false);
      const liveSession = await createLiveSession();
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
      cleanupRuntime();
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
    cleanupRuntime();
  }

  function cleanupRuntime() {
    const runtime = runtimeRef.current;
    setContextSyncReadyValue(false);
    if (!runtime) {
      setIsConnected(false);
      setContextSending(false);
      setPendingContextEdits(0);
      setContextSyncError(null);
      setLastContextSentAt(null);
      setLastContextVersion(0);
      lastLoggedContextVersionRef.current = 0;
      lastLoggedContextErrorRef.current = null;
      return;
    }

    runtime.closeState.expected = true;
    runtimeRef.current = null;
    runtime.contextSync.stop();
    runtime.detachTranscriptObserver();
    runtime.view.disconnect();
    runtime.view.videoElement.remove();
    runtime.view.audioElement.remove();
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
    cleanupRuntime();
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
      <section
        ref={panelRef}
        className={`${minimized ? "w-[min(260px,calc(100vw-24px))]" : "w-[min(392px,calc(100vw-24px))]"} overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-float`}
      >
        <div
          className="flex h-12 cursor-move touch-none items-center gap-2 border-b border-slate-200 bg-slate-950 px-3 text-white"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
        >
          <GripHorizontal className="size-4 shrink-0 text-white/55" />
          <RadioTower className="size-4 shrink-0 text-cyan-200" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Lyra</div>
            <div className="truncate text-[11px] text-white/60">{statusText} / {subtitle}</div>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={minimized ? "Restore avatar window" : "Minimize avatar window"}
            title={minimized ? "Restore" : "Minimize"}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={() => setMinimized((current) => !current)}
          >
            {minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}
          </button>
        </div>

        {!minimized ? (
          <div className="grid gap-3 p-3">
            <div className="relative aspect-square min-h-[300px] overflow-hidden rounded-md bg-[#101418]">
              <div ref={containerRef} className="h-full w-full overflow-hidden" />
              {!isConnected ? (
                <div className="absolute inset-0 grid place-items-center px-5 text-center">
                  <div>
                    <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-white/10 text-white">
                      <Mic className="size-5" />
                    </div>
                    <p className="text-sm font-medium text-white">Live interviewer</p>
                    <p className="mt-1 text-xs text-white/60">System design interview</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={() => {
                  void connect();
                }}
                disabled={isConnecting || isConnected}
              >
                {isConnecting ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
                Start
              </button>
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                onClick={() => {
                  void endCall();
                }}
                disabled={!isConnected && !runtimeRef.current}
              >
                <PhoneOff className="size-4" />
                End
              </button>
            </div>

            {error ? (
              <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {showConnectionLog && events.length > 0 ? (
              <div className="max-h-28 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                {events.map((event) => (
                  <div key={event}>{event}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
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
