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
  type CanvasContextSync,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  hasLiveVideoTrack,
  isMissingUserCameraError,
  requestUserCamera,
  stopMediaStream,
  userCameraErrorMessage
} from "@/utils/interview/userCamera";
import { INTERVIEW_DURATION_MS } from "@/utils/interview/interviewTimer";

export type InterviewStartup = {
  cameraRequest: Promise<MediaStream>;
  liveSessionRequest: Promise<LiveSessionResponse>;
};

export type AvatarStatus = "idle" | "connecting" | "connected";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "unavailable"
  | "off";

type AvatarRuntime = {
  view: PersonaView;
  contextSync: CanvasContextSync;
  closeState: { expected: boolean; disconnectHandled: boolean };
};

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
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<AvatarRuntime | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
  const latestCanvasTextRef = useRef(canvasText);

  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>("idle");
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canvasSyncStatus, setCanvasSyncStatus] = useState<CanvasSyncStatus>(
    INITIAL_CANVAS_SYNC_STATUS
  );
  const [timerDeadline, setTimerDeadline] = useState<number | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState(INTERVIEW_DURATION_MS);

  useEffect(() => {
    latestCanvasTextRef.current = canvasText;
    const runtime = runtimeRef.current;
    if (runtime?.contextSync.getStatus().isReady) {
      runtime.contextSync.push(canvasText);
    }
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
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      void cleanupRuntime().catch((error) => {
        console.error("Failed to clean up avatar.", error);
      });
    };
  }, []);

  useEffect(() => {
    // The frame delay makes StrictMode's mount/unmount/mount cycle cancel the
    // first join, so development builds do not connect the avatar twice.
    const frame = window.requestAnimationFrame(() => {
      void Promise.allSettled([
        enableCamera(startup.cameraRequest),
        connect(startup.liveSessionRequest)
      ]);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [startup]);

  useEffect(() => {
    if (timerDeadline === null) return;

    const tick = () => {
      const remaining = Math.max(0, timerDeadline - Date.now());
      setTimeRemainingMs(remaining);
      if (remaining === 0) {
        window.clearInterval(interval);
        setTimerDeadline(null);
        void disconnectAvatar();
      }
    };

    const interval = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(interval);
  }, [timerDeadline]);

  // The remaining time freezes at the last 250ms tick, which is exact enough
  // for a display that rounds up to whole seconds.
  function stopTimer() {
    setTimerDeadline(null);
  }

  async function connect(
    liveSessionRequest = createLiveSession(packet.packetId)
  ) {
    setTimerDeadline(null);
    setTimeRemainingMs(INTERVIEW_DURATION_MS);
    setAvatarError(null);
    setAvatarStatus("connecting");
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);

    try {
      await cleanupRuntime();
      const liveSession = await liveSessionRequest;
      if (!isMountedRef.current) return;
      const container = personaContainerRef.current;
      if (!container) throw new Error("Avatar container is not ready.");

      container.replaceChildren();
      const closeState = { expected: false, disconnectHandled: false };
      let connectError: string | null = null;
      const view = new PersonaView({
        container,
        sessionDetails: liveSession.sessionDetails,
        voiceAgentDetails: liveSession.voiceAgentDetails,
        dynamicVariables: liveSession.voiceAgentDetails.dynamic_variables,
        videoFit: "cover",
        onStateChange: (status) => {
          setAvatarStatus(
            status === "connected"
              ? "connected"
              : status === "connecting"
                ? "connecting"
                : "idle"
          );
        },
        onDisconnect: () => {
          if (closeState.expected || closeState.disconnectHandled) return;
          closeState.disconnectHandled = true;
          handleUnexpectedDisconnect("Avatar disconnected.");
        },
        onError: (error) => {
          connectError = error.message;
          showAvatarError(`Avatar error: ${error.message}`);
        }
      });
      const contextSync = createCanvasContextSync({
        sendContextUpdate: (text) => view.sendContext(text),
        onStatusChange: setCanvasSyncStatus
      });

      runtimeRef.current = { view, contextSync, closeState };

      await view.connect();
      if (!isMountedRef.current) return;
      if (view.status !== "connected") {
        throw new Error(connectError ?? "Avatar failed to connect.");
      }

      contextSync.push(latestCanvasTextRef.current);
      contextSync.start();
      setAvatarStatus("connected");
      setTimerDeadline(Date.now() + INTERVIEW_DURATION_MS);
    } catch (error) {
      if (!isMountedRef.current) return;
      try {
        await cleanupRuntime();
      } catch (cleanupError) {
        console.error(
          "Failed to clean up avatar after connection error.",
          cleanupError
        );
      }
      showAvatarError(formatAvatarError(error));
      setAvatarStatus("idle");
      setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
    }
  }

  async function enableCamera(cameraRequest?: Promise<MediaStream>) {
    setCameraError(null);
    setCameraStatus("requesting");

    try {
      const existingStream = cameraStreamRef.current;
      if (hasLiveVideoTrack(existingStream)) {
        setCameraStream(existingStream);
        setCameraStatus("ready");
        return;
      }

      if (existingStream) {
        stopMediaStream(existingStream);
        cameraStreamRef.current = null;
        setCameraStream(null);
      }

      const stream = await (cameraRequest ?? requestUserCamera());
      if (!isMountedRef.current) {
        stopMediaStream(stream);
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus("ready");
    } catch (error) {
      if (!isMountedRef.current) return;
      setCameraStatus("unavailable");
      // A machine without a camera is expected; the tile itself communicates
      // the state, so only real failures surface as errors.
      if (!isMissingUserCameraError(error)) {
        setCameraError(userCameraErrorMessage(error));
        onVisibleError();
      }
    }
  }

  function toggleCamera() {
    if (cameraStatus !== "ready") {
      void enableCamera();
      return;
    }

    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStatus("off");
    setCameraError(null);
  }

  async function disconnectAvatar() {
    stopTimer();
    setAvatarError(null);
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

  function toggleAvatar() {
    if (avatarStatus === "connected") {
      void disconnectAvatar();
    } else {
      void connect();
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
    const cleanupPromise = destroyRuntime(runtime);
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
    setAvatarStatus("idle");
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
  }

  function handleUnexpectedDisconnect(message: string) {
    stopTimer();
    showAvatarError(message);
    void cleanupRuntime().catch((error) => {
      showAvatarError(`${message} ${formatAvatarError(error)}`);
    });
  }

  function showAvatarError(message: string) {
    setAvatarError(message);
    onVisibleError();
  }

  return {
    personaContainerRef,
    userVideoRef,
    avatarStatus,
    isEndingCall,
    avatarError,
    cameraStatus,
    cameraError,
    interviewTimeRemainingMs: timeRemainingMs,
    canvasSyncStatus,
    toggleCamera,
    toggleAvatar
  };
}

async function destroyRuntime(runtime: AvatarRuntime): Promise<void> {
  runtime.closeState.expected = true;
  runtime.contextSync.stop();

  try {
    await runtime.view.disconnect();
  } finally {
    runtime.view.videoElement.remove();
    runtime.view.audioElement.remove();
  }
}

function formatAvatarError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not connect avatar.";
}
