import { PersonaView } from "@keyframelabs/elements";
import { useEffect, useRef, useState } from "react";

import {
  createLiveSession,
  type InterviewPacket,
  type LiveSessionResponse
} from "@/lib/api";
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
  stopMediaStream,
  userCameraErrorMessage
} from "@/utils/interview/userCamera";
import {
  createInterviewDeadline,
  INTERVIEW_DURATION_MS,
  interviewTimeRemaining
} from "@/utils/interview/interviewTimer";

export type InterviewStartup = {
  cameraRequest: Promise<MediaStream>;
  liveSessionRequest: Promise<LiveSessionResponse>;
};

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "unavailable"
  | "off";

type InterviewMediaSessionOptions = {
  canvasText: string;
  packet: InterviewPacket;
  startup: InterviewStartup;
  onVisibleError: () => void;
};

export function useInterviewMediaSession({
  canvasText,
  packet,
  startup,
  onVisibleError
}: InterviewMediaSessionOptions) {
  const personaContainerRef = useRef<HTMLDivElement | null>(null);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const userCameraStreamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<PersonaViewRuntime | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
  const latestCanvasTextRef = useRef(canvasText);
  const lastLoggedContextVersionRef = useRef(0);
  const lastLoggedContextErrorRef = useRef<string | null>(null);
  const interviewDeadlineRef = useRef<number | null>(null);
  const hasInterviewExpiredRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [hasEndedCall, setHasEndedCall] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [interviewDeadline, setInterviewDeadline] = useState<number | null>(
    null
  );
  const [interviewTimeRemainingMs, setInterviewTimeRemainingMs] = useState(
    INTERVIEW_DURATION_MS
  );
  const [events, setEvents] = useState<string[]>([]);
  const [canvasSyncStatus, setCanvasSyncStatus] = useState<CanvasSyncStatus>(
    INITIAL_CANVAS_SYNC_STATUS
  );

  useEffect(() => {
    latestCanvasTextRef.current = canvasText;
    const runtime = runtimeRef.current;
    if (!runtime?.contextSync.getStatus().isReady) return;

    runtime.contextSync.push(canvasText);
  }, [canvasText]);

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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
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
    if (interviewDeadline === null) return;

    let interval: number | undefined;

    const updateTimer = () => {
      const remaining = interviewTimeRemaining(interviewDeadline, Date.now());
      setInterviewTimeRemainingMs(remaining);
      if (remaining > 0 || hasInterviewExpiredRef.current) return;

      if (interval !== undefined) window.clearInterval(interval);
      hasInterviewExpiredRef.current = true;
      void disconnectLyra();
    };

    updateTimer();
    interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [interviewDeadline]);

  async function connect(
    liveSessionRequest = createLiveSession(packet.packetId)
  ) {
    if (hasInterviewExpiredRef.current) return;

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
      if (!isMountedRef.current || hasInterviewExpiredRef.current) return;
      const container = personaContainerRef.current;
      if (!container) throw new Error("Avatar container is not ready.");

      clearContainer(container);
      const closeState = { expected: false, disconnectHandled: false };
      let connectError: string | null = null;
      const view = new PersonaView({
        container,
        sessionDetails: liveSession.sessionDetails,
        voiceAgentDetails: liveSession.voiceAgentDetails,
        dynamicVariables: liveSession.voiceAgentDetails.dynamic_variables,
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
      if (hasInterviewExpiredRef.current) {
        await cleanupRuntime();
        return;
      }
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
      if (interviewDeadlineRef.current === null) {
        const deadline = createInterviewDeadline(Date.now());
        interviewDeadlineRef.current = deadline;
        setInterviewDeadline(deadline);
        setInterviewTimeRemainingMs(
          interviewTimeRemaining(deadline, Date.now())
        );
      }
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
    stopMediaStream(stream);
    userCameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStatus("off");
    setCameraError(null);
  }

  function toggleCamera() {
    if (cameraStatus === "ready") {
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
    if (hasInterviewExpiredRef.current) return;

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
    onVisibleError();
  }

  function showCameraError(message: string) {
    setCameraError(message);
    onVisibleError();
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

  return {
    personaContainerRef,
    userVideoRef,
    isConnecting,
    isConnected,
    isEndingCall,
    hasEndedCall,
    avatarError,
    cameraError,
    cameraStatus,
    interviewTimeRemainingMs,
    hasInterviewExpired: hasInterviewExpiredRef.current,
    events,
    canvasSyncStatus,
    joinInterview,
    toggleCamera,
    toggleLyra
  };
}

function clearContainer(container: HTMLElement) {
  while (container.firstChild) container.firstChild.remove();
}

function formatAvatarError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not connect Lyra.";
}
