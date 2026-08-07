import { PersonaView } from "@keyframelabs/elements";
import { useEffect, useRef, useState } from "react";
import {
  endSession,
  submitTurn,
  translateTranscript,
  type LiveSessionResponse,
  type SessionSummary,
  type TranscriptEntry,
  type TurnFeedback
} from "@/lib/api";
import { playGoodResponseSound, playPowerCompleteSound } from "@/lib/feedbackAudio";

const WRAP_UP = "Bring the role-play to a natural close in the next exchange. Do not mention timing or elapsed time.";
const POWER_RESET_DELAY = 1_100;
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export type AvatarTranscript = {
  id: number;
  text: string;
  translation: string | null;
  translationStatus: "loading" | "ready" | "error";
  showTranslation: boolean;
};

export function useLiveSession({
  sessionRequest,
  onComplete
}: {
  sessionRequest: Promise<LiveSessionResponse>;
  onComplete: (summary: SessionSummary) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);
  const complete = useRef(onComplete);
  const runtime = useRef({
    session: null as LiveSessionResponse | null,
    view: null as PersonaView | null,
    camera: null as MediaStream | null,
    transcript: [] as TranscriptEntry[],
    queue: Promise.resolve(),
    finish: null as Promise<void> | null,
    wrapUpTimer: null as ReturnType<typeof setTimeout> | null,
    powerResetTimer: null as ReturnType<typeof setTimeout> | null,
    avatarTranscriptId: 0,
    powerLevel: 0,
    turns: 0,
    answered: 0,
    connected: false,
    expectedDisconnect: false,
    startupFailed: false
  });
  const [avatarConnected, setAvatarConnected] = useState(false);
  const [avatarTranscript, setAvatarTranscript] = useState<AvatarTranscript | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState<{ value: TurnFeedback; canFade: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  const [powerLevel, setPowerLevel] = useState(0);
  const [startupFailed, setStartupFailed] = useState(false);
  complete.current = onComplete;

  useEffect(() => {
    mounted.current = true;
    void startCamera();
    void connect();
    return () => {
      mounted.current = false;
      release();
    };
  }, []);

  function clearWrapUpTimer() {
    if (runtime.current.wrapUpTimer) clearTimeout(runtime.current.wrapUpTimer);
    runtime.current.wrapUpTimer = null;
  }

  function clearPowerResetTimer() {
    if (runtime.current.powerResetTimer) clearTimeout(runtime.current.powerResetTimer);
    runtime.current.powerResetTimer = null;
  }

  function stopCamera() {
    runtime.current.camera?.getTracks().forEach((track) => track.stop());
    runtime.current.camera = null;
    if (userVideoRef.current) userVideoRef.current.srcObject = null;
    if (mounted.current) setCameraReady(false);
  }

  function release() {
    clearWrapUpTimer();
    clearPowerResetTimer();
    runtime.current.expectedDisconnect = true;
    runtime.current.view?.disconnect();
    runtime.current.view = null;
    stopCamera();
  }

  async function startCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" }
      });
      if (!mounted.current || runtime.current.expectedDisconnect) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      runtime.current.camera = stream;
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        void userVideoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
      setCameraError(null);
    } catch (reason) {
      if (mounted.current) setCameraError(message(reason, "Camera access failed."));
    }
  }

  function closeAbandonedSession() {
    const { session, transcript } = runtime.current;
    if (session) void endSession(session.sessionId, transcript).catch(() => undefined);
  }

  function failStartup(reason: unknown) {
    if (runtime.current.startupFailed) return;
    runtime.current.startupFailed = true;
    release();
    closeAbandonedSession();
    if (mounted.current) {
      setError(message(reason, "Session startup failed."));
      setStartupFailed(true);
    }
  }

  function fail(reason: unknown) {
    if (!runtime.current.connected) return failStartup(reason);
    if (mounted.current) setError(message(reason, "Avatar connection failed."));
    void finish(true);
  }

  function addPower() {
    clearPowerResetTimer();
    const nextLevel = runtime.current.powerLevel >= 8 ? 1 : runtime.current.powerLevel + 1;
    runtime.current.powerLevel = nextLevel;
    if (mounted.current) setPowerLevel(nextLevel);

    if (nextLevel < 8) {
      playGoodResponseSound();
      return;
    }

    playPowerCompleteSound();
    runtime.current.powerResetTimer = setTimeout(() => {
      runtime.current.powerResetTimer = null;
      if (runtime.current.powerLevel !== 8) return;
      runtime.current.powerLevel = 0;
      if (mounted.current) setPowerLevel(0);
    }, POWER_RESET_DELAY);
  }

  async function prefetchTranslation(sessionId: string, id: number, text: string) {
    try {
      const result = await translateTranscript(sessionId, text);
      if (mounted.current) setAvatarTranscript((current) =>
        current?.id === id
          ? { ...current, translation: result.translation, translationStatus: "ready" }
          : current
      );
    } catch {
      if (mounted.current) setAvatarTranscript((current) =>
        current?.id === id ? { ...current, translationStatus: "error" } : current
      );
    }
  }

  async function connect() {
    try {
      const session = await sessionRequest;
      runtime.current.session = session;
      if (!mounted.current || runtime.current.startupFailed) return closeAbandonedSession();
      if (runtime.current.finish || runtime.current.expectedDisconnect) return;
      if (!avatarRef.current) return failStartup(new Error("Avatar view is unavailable."));
      const view = new PersonaView({
        container: avatarRef.current,
        sessionDetails: session.persona.sessionDetails,
        voiceAgentDetails: session.persona.voiceAgentDetails,
        dynamicVariables: session.persona.dynamicVariables,
        videoFit: "cover",
        onStateChange: (state) => {
          if (mounted.current) setAvatarConnected(state === "connected");
          if (state === "connected") {
            runtime.current.connected = true;
            runtime.current.wrapUpTimer ??= setTimeout(() => view.sendContext(WRAP_UP), 90_000);
          } else if (state === "error") fail(new Error("Avatar connection failed."));
        },
        onTranscript: (entry) => {
          const item: TranscriptEntry = { role: entry.role, text: entry.text.trim() };
          if (item.role === "assistant" && !item.text) return;
          runtime.current.transcript.push(item);
          if (item.role === "assistant") {
            runtime.current.answered = runtime.current.turns;
            const id = ++runtime.current.avatarTranscriptId;
            if (mounted.current) {
              setAvatarTranscript({
                id,
                text: item.text,
                translation: null,
                translationStatus: "loading",
                showTranslation: false
              });
              setDisplayed((current) =>
                current && current.value.turnId <= runtime.current.answered ? { ...current, canFade: true } : current
              );
            }
            void prefetchTranslation(session.sessionId, id, item.text);
            return;
          }
          const turnId = ++runtime.current.turns;
          const transcript = [...runtime.current.transcript];
          runtime.current.queue = runtime.current.queue.then(async () => {
            let failure: unknown;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const value = await submitTurn(session.sessionId, turnId, transcript);
                if (mounted.current) {
                  setDisplayed({ value, canFade: value.turnId <= runtime.current.answered });
                  setError(null);
                  if (value.feedback === "Great Job!") addPower();
                }
                return;
              } catch (reason) {
                failure = reason;
              }
            }
            if (mounted.current) setError(message(failure, "Turn evaluation failed."));
          });
        },
        onDisconnect: () => {
          if (runtime.current.expectedDisconnect) return;
          runtime.current.view = null;
          stopCamera();
          if (mounted.current) setCameraError("Camera stopped because the conversation ended.");
          void finish(false);
        },
        onError: fail
      });
      runtime.current.view = view;
      await view.connect();
    } catch (reason) {
      fail(reason);
    }
  }

  function finish(disconnect: boolean): Promise<void> {
    if (runtime.current.finish) return runtime.current.finish;
    if (mounted.current) setEnding(true);
    clearWrapUpTimer();
    if (disconnect) release();
    const task = (async () => {
      await runtime.current.queue;
      const session = runtime.current.session ?? await sessionRequest;
      const summary = await endSession(session.sessionId, runtime.current.transcript);
      if (mounted.current) complete.current(summary);
    })().catch((reason: unknown) => {
      runtime.current.finish = null;
      if (mounted.current) {
        setEnding(false);
        setError(message(reason, "Could not end the session."));
      }
    });
    runtime.current.finish = task;
    return task;
  }

  return {
    avatarRef,
    avatarConnected,
    avatarTranscript,
    cameraError,
    cameraReady,
    ending,
    error,
    feedback: displayed?.value ?? null,
    feedbackCanFade: displayed?.canFade ?? false,
    finish: () => void finish(true),
    powerLevel,
    startupFailed,
    toggleAvatarTranslation: () => setAvatarTranscript((current) =>
      current ? { ...current, showTranslation: !current.showTranslation } : current
    ),
    userVideoRef,
    clearFeedback: (turnId: number) => setDisplayed((current) => current?.value.turnId === turnId ? null : current)
  };
}
