import { PersonaView } from "@keyframelabs/elements";
import { useEffect, useRef, useState } from "react";
import {
  endSession,
  submitTurn,
  translateTranscript,
  type BilingualSegment,
  type LiveSessionResponse,
  type SessionSummary,
  type TranscriptEntry,
  type TurnFeedback
} from "@/lib/api";
import { FREESTYLE_MODE, GUIDED_MODE, type ConversationModeId } from "@/lib/conversationMode";
import {
  createGuidedSession,
  emptyGuidedCoach,
  type GuidedCoach,
  type GuidedSessionController
} from "@/lib/guidedSession";
import { createSessionPower, type SessionPowerController } from "@/lib/sessionPower";
import {
  visiblePersonaText,
  visiblePersonaTiming,
  type AvatarTiming
} from "@/lib/persona";

export type { GuidedCoach } from "@/lib/guidedSession";

const SESSION_DURATION_MS = 5 * 60 * 1000;
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;
const avatarError = (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error("Avatar connection failed.");
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return new Error("Microphone access is blocked. Allow it for localhost in Chrome, then retry.");
  }
  if (error.name === "NotFoundError") return new Error("No microphone is available. Connect one, then retry.");
  if (error.name === "NotReadableError") return new Error("Chrome could not access the microphone. Close other audio apps, then retry.");
  return error;
};

export type ConversationMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  highlightedCharacters: number;
  translation: string | null;
  segments: BilingualSegment[] | null;
  translationStatus: "loading" | "ready" | "error";
};

type DisplayedFeedback = { value: TurnFeedback; canFade: boolean } | null;

type LiveSessionView = {
  avatarConnected: boolean;
  displayedFeedback: DisplayedFeedback;
  ending: boolean;
  error: string | null;
  guidedCoach: GuidedCoach;
  latestMessages: ConversationMessage[];
  mode: ConversationModeId;
  multiplier: number;
  powerCelebrations: number;
  sessionTimeRemainingMs: number;
  startupFailed: boolean;
  streakProgress: number;
};

type Runtime = {
  active: boolean;
  agentState: "listening" | "speaking";
  avatarKaraokeTimers: Array<ReturnType<typeof setTimeout>>;
  avatarSpeechStartedAt: number | null;
  connected: boolean;
  expectedDisconnect: boolean;
  finish: Promise<void> | null;
  guided: GuidedSessionController | null;
  messageId: number;
  onComplete: (summary: SessionSummary) => void;
  power: SessionPowerController | null;
  queue: Promise<void>;
  session: LiveSessionResponse | null;
  sessionClosed: boolean;
  sessionTimer: ReturnType<typeof setInterval> | null;
  startupFailed: boolean;
  transcript: TranscriptEntry[];
  turns: number;
  view: PersonaView | null;
};

type ViewUpdate = Partial<LiveSessionView> | ((current: LiveSessionView) => Partial<LiveSessionView>);

export function useLiveSession({
  initialMode,
  sessionRequest,
  onComplete
}: {
  initialMode: ConversationModeId;
  sessionRequest: Promise<LiveSessionResponse>;
  onComplete: (summary: SessionSummary) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime>({
    active: true,
    agentState: "listening",
    avatarKaraokeTimers: [],
    avatarSpeechStartedAt: null,
    connected: false,
    expectedDisconnect: false,
    finish: null,
    guided: null,
    messageId: 0,
    onComplete,
    power: null,
    queue: Promise.resolve(),
    session: null,
    sessionClosed: false,
    sessionTimer: null,
    startupFailed: false,
    transcript: [],
    turns: 0,
    view: null
  });
  const [viewState, setViewState] = useState<LiveSessionView>(() => ({
    avatarConnected: false,
    displayedFeedback: null,
    ending: false,
    error: null,
    guidedCoach: emptyGuidedCoach(),
    latestMessages: [],
    mode: initialMode,
    multiplier: 1,
    powerCelebrations: 0,
    sessionTimeRemainingMs: SESSION_DURATION_MS,
    startupFailed: false,
    streakProgress: 0
  }));

  function patchView(update: ViewUpdate) {
    if (!runtime.current.active) return;
    setViewState((current) => {
      const patch = typeof update === "function" ? update(current) : update;
      const changed = (Object.keys(patch) as Array<keyof LiveSessionView>)
        .some((key) => !Object.is(current[key], patch[key]));
      return changed ? { ...current, ...patch } : current;
    });
  }

  const power = runtime.current.power ??= createSessionPower({
    active: () => runtime.current.active,
    publish: (next) => patchView(next)
  });
  const guided = runtime.current.guided ??= createGuidedSession({
    active: () => runtime.current.active,
    context: () => ({
      agentState: runtime.current.agentState,
      connected: runtime.current.connected,
      expectedDisconnect: runtime.current.expectedDisconnect,
      finishing: Boolean(runtime.current.finish),
      sessionId: runtime.current.session?.sessionId ?? null,
      transcript: runtime.current.transcript,
      view: runtime.current.view
    }),
    rewardSuggestion: power.rewardGuidedSuggestion,
    setError: (error) => patchView({ error }),
    updateCoach: (update) => patchView((current) => ({ guidedCoach: update(current.guidedCoach) }))
  }, initialMode);
  runtime.current.onComplete = onComplete;

  useEffect(() => {
    runtime.current.active = true;
    window.addEventListener("pagehide", closeAbandonedSession);
    void connect();
    return () => {
      window.removeEventListener("pagehide", closeAbandonedSession);
      runtime.current.active = false;
      closeAbandonedSession();
      release();
    };
  }, []);

  function clearSessionTimer() {
    if (runtime.current.sessionTimer) clearInterval(runtime.current.sessionTimer);
    runtime.current.sessionTimer = null;
  }

  function startSessionTimer() {
    if (runtime.current.sessionTimer || runtime.current.finish) return;
    const deadline = Date.now() + SESSION_DURATION_MS;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      patchView((current) => Math.ceil(current.sessionTimeRemainingMs / 1000) === Math.ceil(remaining / 1000)
        ? {}
        : { sessionTimeRemainingMs: remaining });
      if (remaining === 0) {
        clearSessionTimer();
        void finish(true);
      }
    };
    runtime.current.sessionTimer = setInterval(tick, 250);
    tick();
  }

  function cancelAvatarKaraoke() {
    runtime.current.avatarKaraokeTimers.forEach(clearTimeout);
    runtime.current.avatarKaraokeTimers = [];
  }

  function release() {
    guided.release();
    power.release();
    clearSessionTimer();
    cancelAvatarKaraoke();
    runtime.current.expectedDisconnect = true;
    runtime.current.view?.disconnect();
    runtime.current.view = null;
  }

  function closeAbandonedSession() {
    const current = runtime.current;
    if (!current.session || current.sessionClosed) return;
    current.sessionClosed = true;
    void Promise.resolve(endSession(current.session.sessionId, current.transcript, true)).catch(() => undefined);
  }

  function failStartup(reason: unknown) {
    if (runtime.current.startupFailed) return;
    runtime.current.startupFailed = true;
    release();
    closeAbandonedSession();
    patchView({ error: message(reason, "Session startup failed."), startupFailed: true });
  }

  function fail(reason: unknown) {
    if (!runtime.current.connected) return failStartup(reason);
    patchView({ error: message(reason, "Avatar connection failed.") });
    void finish(true);
  }

  function putLatestMessage(next: ConversationMessage) {
    patchView((current) => ({
      latestMessages: [...current.latestMessages.filter((item) => item.role !== next.role), next]
        .sort((left, right) => left.id - right.id)
    }));
  }

  function updateLatestMessage(id: number, update: Partial<ConversationMessage>) {
    patchView((current) => ({
      latestMessages: current.latestMessages.map((item) => item.id === id ? { ...item, ...update } : item)
    }));
  }

  async function prefetchTranslation(sessionId: string, id: number, text: string) {
    try {
      const result = await translateTranscript(sessionId, text);
      updateLatestMessage(id, {
        translation: result.translation,
        segments: result.segments,
        translationStatus: "ready"
      });
    } catch {
      updateLatestMessage(id, { translationStatus: "error" });
    }
  }

  function animateAvatarTranscript(id: number, text: string, timing: AvatarTiming[]) {
    cancelAvatarKaraoke();
    if (!timing.length) {
      if (runtime.current.agentState === "listening") {
        updateLatestMessage(id, { highlightedCharacters: text.length });
      }
      return;
    }
    const elapsed = Math.max(0, performance.now() - (runtime.current.avatarSpeechStartedAt ?? performance.now()));
    let boundary = 0;
    let elapsedBoundary = 0;
    for (const item of timing) {
      boundary = Math.min(text.length, boundary + item.text.length);
      if (item.startMs <= elapsed) {
        elapsedBoundary = boundary;
      } else {
        const highlightedCharacters = boundary;
        runtime.current.avatarKaraokeTimers.push(setTimeout(() => {
          if (runtime.current.agentState === "speaking") updateLatestMessage(id, { highlightedCharacters });
        }, item.startMs - elapsed));
      }
    }
    if (elapsedBoundary) updateLatestMessage(id, { highlightedCharacters: elapsedBoundary });
  }

  function completeAvatarKaraoke() {
    cancelAvatarKaraoke();
    patchView((current) => ({
      latestMessages: current.latestMessages.map((item) => item.role === "assistant"
        ? { ...item, highlightedCharacters: item.text.length }
        : item)
    }));
  }

  async function connect() {
    try {
      const session = await sessionRequest;
      runtime.current.session = session;
      if (!runtime.current.active || runtime.current.startupFailed) return closeAbandonedSession();
      if (runtime.current.finish || runtime.current.expectedDisconnect) return;
      if (!avatarRef.current) return failStartup(new Error("Avatar view is unavailable."));
      const view = new PersonaView({
        container: avatarRef.current,
        sessionDetails: session.persona.sessionDetails,
        voiceAgentDetails: session.persona.voiceAgentDetails,
        dynamicVariables: session.persona.dynamicVariables,
        videoFit: "cover",
        onStateChange: (state) => {
          patchView({ avatarConnected: state === "connected" });
          if (state === "connected") {
            runtime.current.connected = true;
            guided.syncInput();
            startSessionTimer();
          }
        },
        onAgentStateChange: (state) => {
          runtime.current.agentState = state;
          if (state === "speaking") {
            runtime.current.avatarSpeechStartedAt = performance.now();
            guided.onAgentStateChange(state);
          } else {
            completeAvatarKaraoke();
            guided.onAgentStateChange(state);
          }
        },
        onTranscript: (entry) => {
          const rawText = entry.text.trim();
          const rawTiming = (entry.timing ?? []) as AvatarTiming[];
          const acceptedText = entry.role === "assistant"
            ? visiblePersonaText(rawText)
            : guided.learnerTranscript(rawText);
          if (entry.role === "user" && !acceptedText) return;
          const item: TranscriptEntry = { role: entry.role, text: acceptedText ?? "" };
          if (entry.role === "user") guided.acceptLearnerTranscript();
          const timing = entry.role === "assistant" ? visiblePersonaTiming(rawTiming) : rawTiming;
          if (!item.text) return;
          runtime.current.transcript.push(item);
          const id = ++runtime.current.messageId;
          putLatestMessage({
            id,
            role: item.role,
            text: item.text,
            highlightedCharacters: item.role === "assistant" ? 0 : item.text.length,
            translation: null,
            segments: null,
            translationStatus: "loading"
          });
          void prefetchTranslation(session.sessionId, id, item.text);
          if (item.role === "assistant") {
            animateAvatarTranscript(id, item.text, timing);
            guided.onAssistantTranscript();
            return;
          }
          const turnId = ++runtime.current.turns;
          patchView((current) => ({
            displayedFeedback: current.displayedFeedback && turnId > current.displayedFeedback.value.turnId
              ? { ...current.displayedFeedback, canFade: true }
              : current.displayedFeedback
          }));
          const transcript = [...runtime.current.transcript];
          const turnMode = guided.mode();
          runtime.current.queue = runtime.current.queue.then(async () => {
            let failure: unknown;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const value = await submitTurn(session.sessionId, turnId, transcript);
                if (runtime.current.active) {
                  patchView({ error: null });
                  if (turnMode === FREESTYLE_MODE) {
                    if (value.feedback === "Great Job!") power.rewardTurn(value.turnId);
                    else power.rejectTurn(value.turnId);
                  }
                  if (turnMode === FREESTYLE_MODE && guided.mode() === FREESTYLE_MODE) {
                    patchView({
                      displayedFeedback: { value, canFade: runtime.current.turns > value.turnId }
                    });
                  }
                }
                return;
              } catch (reason) {
                failure = reason;
              }
            }
            patchView({ error: message(failure, "Turn evaluation failed.") });
          });
        },
        onDisconnect: () => {
          if (runtime.current.expectedDisconnect) return;
          runtime.current.view = null;
          if (!runtime.current.connected) {
            failStartup(new Error("Avatar disconnected during startup."));
            return;
          }
          void finish(false);
        },
        onError: (reason) => fail(avatarError(reason))
      });
      runtime.current.view = view;
      guided.syncInput();
      await view.connect();
      if (view.status !== "connected") throw new Error("Avatar failed to connect.");
    } catch (reason) {
      fail(reason);
    }
  }

  function setMode(next: ConversationModeId) {
    if (!guided.setMode(next)) return false;
    patchView({ mode: next, ...(next === GUIDED_MODE ? { displayedFeedback: null } : {}) });
    return true;
  }

  function finish(disconnect: boolean): Promise<void> {
    if (runtime.current.finish) return runtime.current.finish;
    clearSessionTimer();
    patchView({ ending: true });
    if (disconnect) release();
    else guided.stop();
    const task = (async () => {
      await runtime.current.queue;
      const session = runtime.current.session ?? await sessionRequest;
      runtime.current.sessionClosed = true;
      let summary: SessionSummary;
      try {
        summary = await endSession(session.sessionId, runtime.current.transcript);
      } catch (reason) {
        runtime.current.sessionClosed = false;
        throw reason;
      }
      if (runtime.current.active) runtime.current.onComplete(summary);
    })().catch((reason: unknown) => {
      runtime.current.finish = null;
      patchView({ ending: false, error: message(reason, "Could not end the session.") });
    });
    runtime.current.finish = task;
    return task;
  }

  return {
    avatarRef,
    avatarConnected: viewState.avatarConnected,
    guidedCoach: viewState.guidedCoach,
    ending: viewState.ending,
    error: viewState.error,
    feedback: viewState.displayedFeedback?.value ?? null,
    feedbackCanFade: viewState.displayedFeedback?.canFade ?? false,
    finish: () => void finish(true),
    guidedMode: viewState.mode === GUIDED_MODE,
    latestMessages: viewState.latestMessages,
    mode: viewState.mode,
    multiplier: viewState.multiplier,
    powerCelebrations: viewState.powerCelebrations,
    sessionTimeRemainingMs: viewState.sessionTimeRemainingMs,
    streakProgress: viewState.streakProgress,
    setMode,
    retryGuidedAsr: guided.retry,
    startupFailed: viewState.startupFailed,
    clearFeedback: (turnId: number) => patchView((current) => ({
      displayedFeedback: current.displayedFeedback?.value.turnId === turnId
        ? null
        : current.displayedFeedback
    }))
  };
}
