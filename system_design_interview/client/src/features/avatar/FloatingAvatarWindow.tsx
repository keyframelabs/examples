import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createClient, type PersonaSession } from "@keyframelabs/sdk";
import { floatTo16BitPCM } from "@keyframelabs/elements";
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
import {
  createContextualUpdateAdapter,
  type CanvasState,
  type ContextualUpdateAdapter
} from "@kfl-system-design/infinite-canvas";

import { createLiveSession } from "../../lib/api";
import { ElevenLabsRuntimeAgent, type RuntimeAgentEventMap } from "../../lib/elevenlabs-runtime-agent";
import type { LiveSessionResponse } from "../../types/live-session";
import { buildCanvasContextualUpdate } from "./context";

type FloatingAvatarWindowProps = {
  canvasState: CanvasState;
  canvasText: string;
};

type ActiveBridge = {
  session: PersonaSession;
  agent: ElevenLabsRuntimeAgent;
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  contextAdapter: ContextualUpdateAdapter;
  closeState: {
    expected: boolean;
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

export function FloatingAvatarWindow({ canvasState, canvasText }: FloatingAvatarWindowProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<ActiveBridge | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestCanvasStateRef = useRef(canvasState);
  const contextSyncReadyRef = useRef(false);
  const contextUpdateVersionRef = useRef(0);
  const [position, setPosition] = useState<Position>(() => initialPosition(PANEL_WIDTH, PANEL_HEIGHT));
  const [minimized, setMinimized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [lastContextSentAt, setLastContextSentAt] = useState<Date | null>(null);
  const [contextPending, setContextPending] = useState(false);
  const showConnectionLog = shouldShowConnectionLog();

  useEffect(() => {
    latestCanvasStateRef.current = canvasState;
    const adapter = bridgeRef.current?.contextAdapter;
    if (adapter) {
      adapter.push(canvasState);
    }
  }, [canvasState]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !contextSyncReadyRef.current) {
      return;
    }

    bridge.contextAdapter.push(latestCanvasStateRef.current);
    setContextPending(true);
    void bridge.contextAdapter
      .flush(latestCanvasStateRef.current)
      .then((sent) => {
        if (!sent) {
          setContextPending(false);
        }
      })
      .catch((err: unknown) => {
        logEvent(`Canvas context sync failed: ${formatError(err)}`);
        setContextPending(false);
      });
  }, [canvasText]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      void cleanupBridge();
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
    setContextPending(true);

    try {
      await cleanupBridge();
      contextSyncReadyRef.current = false;
      contextUpdateVersionRef.current = 0;
      const liveSession = await createLiveSession();
      const container = containerRef.current;
      if (!container) {
        throw new Error("Avatar container is not ready.");
      }

      clearContainer(container);
      const videoElement = createVideoElement();
      const audioElement = createAudioElement();
      container.appendChild(videoElement);
      container.appendChild(audioElement);

      const agent = new ElevenLabsRuntimeAgent();
      const closeState = { expected: false };
      const personaSession = createPersonaSession(liveSession, videoElement, audioElement, closeState);
      const contextAdapter = createContextualUpdateAdapter((text) => {
        const version = contextUpdateVersionRef.current + 1;
        contextUpdateVersionRef.current = version;
        agent.sendContextUpdate(buildCanvasContextualUpdate(text, { version }));
        setLastContextSentAt(new Date());
        setContextPending(false);
      });

      agent.on("audio", (audio) => {
        void personaSession.sendAudio(audio);
      });
      agent.on("turnEnd", () => {
        logEvent("ElevenLabs turn ended");
        void personaSession.endAudioTurn();
      });
      agent.on("interrupted", () => {
        logEvent("ElevenLabs interruption");
        void personaSession.endAudioTurn();
        void personaSession.interrupt();
      });
      agent.on("emotion", (emotion) => {
        void personaSession.setEmotion(emotion);
      });
      agent.on("stateChange", (nextStatus: RuntimeAgentEventMap["stateChange"]) => {
        logEvent(`ElevenLabs state: ${nextStatus}`);
      });
      agent.on("transcript", (transcript: RuntimeAgentEventMap["transcript"]) => {
        if (transcript.isFinal && transcript.text.trim()) {
          logEvent(`Transcript received: ${transcript.role}`);
        }
      });
      agent.on("closed", (closed: RuntimeAgentEventMap["closed"]) => {
        if (closeState.expected) {
          return;
        }
        const reason = formatAgentClose(closed);
        logEvent(`ElevenLabs closed: ${reason}`);
        handleUnexpectedClose("elevenlabs", reason);
      });

      logEvent("Connecting to Keyframe room");
      await personaSession.connect();

      logEvent("Requesting microphone");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16_000, echoCancellation: true, noiseSuppression: true }
      });
      const audioContext = new AudioContext({ sampleRate: 16_000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      bridgeRef.current = {
        session: personaSession,
        agent,
        stream,
        audioContext,
        source,
        processor,
        videoElement,
        audioElement,
        contextAdapter,
        closeState
      };

      processor.onaudioprocess = (event) => {
        agent.sendAudio(floatTo16BitPCM(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);

      logEvent("Connecting to ElevenLabs");
      await agent.connect({
        agentId: liveSession.voiceAgentDetails.agent_id ?? "",
        signedUrl: liveSession.voiceAgentDetails.signed_url,
        inputSampleRate: 16_000,
        voiceAgentDetails: liveSession.voiceAgentDetails
      });

      contextSyncReadyRef.current = true;
      contextAdapter.push(latestCanvasStateRef.current);
      contextAdapter.start();
      await contextAdapter.flush(latestCanvasStateRef.current);
      logEvent("Canvas context synced");

      setIsConnected(true);
      logEvent("Live avatar connected");
    } catch (err) {
      await cleanupBridge();
      setError(formatError(err));
      setIsConnected(false);
      setContextPending(false);
    } finally {
      setIsConnecting(false);
    }
  }

  async function endCall() {
    setError(null);
    await cleanupBridge();
  }

  async function cleanupBridge() {
    const bridge = bridgeRef.current;
    contextSyncReadyRef.current = false;
    if (!bridge) {
      setIsConnected(false);
      return;
    }

    bridge.closeState.expected = true;
    bridgeRef.current = null;
    bridge.contextAdapter.stop();
    bridge.stream.getTracks().forEach((track) => track.stop());
    bridge.processor.disconnect();
    bridge.source.disconnect();
    await bridge.audioContext.close().catch(() => undefined);
    bridge.agent.close();
    await bridge.session.close().catch(() => undefined);
    bridge.videoElement.remove();
    bridge.audioElement.remove();
    setIsConnected(false);
  }

  function createPersonaSession(
    liveSession: LiveSessionResponse,
    videoElement: HTMLVideoElement,
    audioElement: HTMLAudioElement,
    closeState: ActiveBridge["closeState"]
  ): PersonaSession {
    return createClient({
      serverUrl: liveSession.sessionDetails.server_url,
      participantToken: liveSession.sessionDetails.participant_token,
      agentIdentity: liveSession.sessionDetails.agent_identity,
      onVideoTrack: (track) => {
        logEvent("Keyframe video track received");
        videoElement.srcObject = new MediaStream([track]);
        void videoElement.play().catch((err: unknown) => {
          logEvent(`Video play blocked: ${formatError(err)}`);
        });
      },
      onAudioTrack: (track) => {
        logEvent("Keyframe audio track received");
        audioElement.srcObject = new MediaStream([track]);
        void audioElement.play().catch(() => undefined);
      },
      onStateChange: (nextStatus) => {
        logEvent(`Keyframe state: ${nextStatus}`);
        setIsConnected(nextStatus === "connected");
      },
      onAgentStateChange: (nextStatus) => {
        logEvent(`Avatar playback: ${nextStatus}`);
      },
      onClose: (reason) => {
        logEvent(`Keyframe room closed: ${reason}`);
        if (closeState.expected) {
          return;
        }
        handleUnexpectedClose("keyframe", reason);
      },
      onError: (err) => {
        logEvent(`Keyframe error: ${err.message}`);
        setError(`Live interviewer error: ${err.message}`);
      }
    });
  }

  function handleUnexpectedClose(source: "keyframe" | "elevenlabs", reason: string) {
    const label = source === "keyframe" ? "Live interviewer" : "Voice connection";
    setError(`${label} disconnected: ${reason}`);
    void cleanupBridge();
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
      ? "Syncing canvas"
      : lastContextSentAt
        ? "Canvas synced"
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
              <div ref={containerRef} className="absolute inset-0" />
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
                disabled={!isConnected && !bridgeRef.current}
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
}

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  return video;
}

function createAudioElement(): HTMLAudioElement {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  return audio;
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

function formatAgentClose(closed: RuntimeAgentEventMap["closed"]): string {
  const code = closed.code ? `code ${closed.code}` : "no code";
  const reason = closed.reason?.trim() ? closed.reason : "no reason";
  return `${code}, ${reason}`;
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
