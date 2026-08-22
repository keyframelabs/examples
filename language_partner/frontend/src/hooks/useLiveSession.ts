import { PersonaView } from "@keyframelabs/elements";
import { useEffect, useRef, useState } from "react";
import {
  endSession,
  submitTurn,
  suggestResponse,
  translateTranscript,
  type BilingualSegment,
  type LiveSessionResponse,
  type SessionSummary,
  type SuggestedResponse,
  type TranscriptEntry,
  type TurnFeedback
} from "@/lib/api";
import {
  FREESTYLE_MODE,
  GUIDED_MODE,
  type ConversationModeId
} from "@/lib/conversationMode";
import { playGoodResponseSound, playPowerCompleteSound } from "@/lib/feedbackAudio";
import {
  browserSpeechRecognition,
  type BrowserSpeechRecognition
} from "@/lib/browserSpeech";
import {
  guidedSubmissionText,
  learnerTranscriptText,
  personaShouldBeMuted,
  submitGuidedText,
  synchronizePersonaMute
} from "@/lib/guidedSession";
import {
  advanceSuggestedSpeechProgress,
  type SuggestedSpeechMatch
} from "@/lib/speechMatching";
import {
  visiblePersonaText,
  visiblePersonaTiming,
  type AvatarTiming
} from "@/lib/persona";

const ASR_RESTART_DELAY = 150;
const ASR_COMPLETE_COMMIT_DELAY = 350;
const GUIDED_RESPONSE_TIMEOUT = 12_000;
const SUGGESTION_ATTEMPTS = 3;
const SUGGESTION_RETRY_DELAY = 2_000;
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

export type GuidedCoach = {
  suggestion: SuggestedResponse | null;
  suggestionStatus: "idle" | "loading" | "ready" | "error";
  matchedWordCount: number;
  speechComplete: boolean;
  asrStatus: "idle" | "listening" | "sending" | "waiting" | "unsupported" | "error";
};

const emptyCoach = (): GuidedCoach => ({
  suggestion: null,
  suggestionStatus: "idle",
  matchedWordCount: 0,
  speechComplete: false,
  asrStatus: "idle"
});

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
  const mounted = useRef(true);
  const complete = useRef(onComplete);
  const runtime = useRef({
    session: null as LiveSessionResponse | null,
    view: null as PersonaView | null,
    recognition: null as BrowserSpeechRecognition | null,
    recognitionRunning: false,
    asrManualRetryRequired: false,
    asrCommitTimer: null as ReturnType<typeof setTimeout> | null,
    recognitionRestartTimer: null as ReturnType<typeof setTimeout> | null,
    guidedResponseTimer: null as ReturnType<typeof setTimeout> | null,
    powerCycleResetTimer: null as ReturnType<typeof setTimeout> | null,
    asrAwaitingResponse: false,
    pendingGuidedScript: null as string | null,
    transcript: [] as TranscriptEntry[],
    queue: Promise.resolve(),
    finish: null as Promise<void> | null,
    avatarKaraokeTimers: [] as ReturnType<typeof setTimeout>[],
    avatarSpeechStartedAt: null as number | null,
    messageId: 0,
    suggestionRequestId: 0,
    guidedSuggestion: null as SuggestedResponse | null,
    guidedMatchedWordCount: 0,
    suggestionReadyForTurn: false,
    sessionTimer: null as ReturnType<typeof setInterval> | null,
    mode: initialMode,
    agentState: "listening" as "listening" | "speaking",
    rewardedGuidedSuggestions: new Set<number>(),
    rewardedTurns: new Set<number>(),
    streakProgress: 0,
    multiplier: 1,
    turns: 0,
    connected: false,
    expectedDisconnect: false,
    startupFailed: false,
    sessionClosed: false
  });
  const [avatarConnected, setAvatarConnected] = useState(false);
  const [latestMessages, setLatestMessages] = useState<ConversationMessage[]>([]);
  const [guidedCoach, setGuidedCoach] = useState<GuidedCoach>(emptyCoach);
  const [mode, setModeState] = useState<ConversationModeId>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState<{ value: TurnFeedback; canFade: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  const [streakProgress, setStreakProgress] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [powerCelebrations, setPowerCelebrations] = useState(0);
  const [startupFailed, setStartupFailed] = useState(false);
  const [sessionTimeRemainingMs, setSessionTimeRemainingMs] = useState(SESSION_DURATION_MS);
  complete.current = onComplete;

  useEffect(() => {
    mounted.current = true;
    window.addEventListener("pagehide", closeAbandonedSession);
    void connect();
    return () => {
      window.removeEventListener("pagehide", closeAbandonedSession);
      mounted.current = false;
      closeAbandonedSession();
      release();
    };
  }, []);

  function clearRecognitionRestartTimer() {
    if (runtime.current.recognitionRestartTimer) clearTimeout(runtime.current.recognitionRestartTimer);
    runtime.current.recognitionRestartTimer = null;
  }

  function clearAsrCommitTimer() {
    if (runtime.current.asrCommitTimer) clearTimeout(runtime.current.asrCommitTimer);
    runtime.current.asrCommitTimer = null;
  }

  function resetAsrCapture() {
    clearAsrCommitTimer();
  }

  function clearGuidedResponseTimer() {
    if (runtime.current.guidedResponseTimer) clearTimeout(runtime.current.guidedResponseTimer);
    runtime.current.guidedResponseTimer = null;
  }

  function clearPowerCycleResetTimer() {
    if (runtime.current.powerCycleResetTimer) clearTimeout(runtime.current.powerCycleResetTimer);
    runtime.current.powerCycleResetTimer = null;
  }

  function clearSessionTimer() {
    if (runtime.current.sessionTimer) clearInterval(runtime.current.sessionTimer);
    runtime.current.sessionTimer = null;
  }

  function startSessionTimer() {
    if (runtime.current.sessionTimer || runtime.current.finish) return;
    const deadline = Date.now() + SESSION_DURATION_MS;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      if (mounted.current) setSessionTimeRemainingMs(remaining);
      if (remaining === 0) {
        clearSessionTimer();
        void finish(true);
      }
    };
    runtime.current.sessionTimer = setInterval(tick, 250);
    tick();
  }

  function setPersonaMuted(muted: boolean) {
    const view = runtime.current.view;
    if (view) synchronizePersonaMute(view, muted);
  }

  function cancelAvatarKaraoke() {
    runtime.current.avatarKaraokeTimers.forEach(clearTimeout);
    runtime.current.avatarKaraokeTimers = [];
  }

  function stopBrowserAsr(mutePersona = true) {
    clearRecognitionRestartTimer();
    resetAsrCapture();
    if (mutePersona && runtime.current.mode === GUIDED_MODE) setPersonaMuted(true);
    const recognition = runtime.current.recognition;
    runtime.current.recognition = null;
    if (!recognition) return;
    runtime.current.recognitionRunning = false;
    try {
      recognition.abort();
    } catch { /* The browser may already have stopped recognition. */ }
  }

  function release() {
    runtime.current.suggestionRequestId += 1;
    clearRecognitionRestartTimer();
    clearGuidedResponseTimer();
    clearPowerCycleResetTimer();
    clearSessionTimer();
    cancelAvatarKaraoke();
    stopBrowserAsr();
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
    const previousProgress = runtime.current.streakProgress;
    const previousMultiplier = runtime.current.multiplier;
    clearPowerCycleResetTimer();
    const progress = (previousProgress >= 30 ? 0 : previousProgress) + 10;
    const cycleComplete = progress === 30;
    const multiplier = cycleComplete ? previousMultiplier + 1 : previousMultiplier;
    runtime.current.streakProgress = progress;
    runtime.current.multiplier = multiplier;
    if (mounted.current) {
      setStreakProgress(progress);
      if (multiplier !== previousMultiplier) setMultiplier(multiplier);
      if (cycleComplete) setPowerCelebrations((current) => current + 1);
    }

    if (cycleComplete) {
      playPowerCompleteSound();
      runtime.current.powerCycleResetTimer = setTimeout(() => {
        runtime.current.powerCycleResetTimer = null;
        if (runtime.current.streakProgress !== 30) return;
        runtime.current.streakProgress = 0;
        if (mounted.current) setStreakProgress(0);
      }, 800);
    } else {
      playGoodResponseSound();
    }
  }

  function resetPower() {
    const previousProgress = runtime.current.streakProgress;
    const previousMultiplier = runtime.current.multiplier;
    if (previousProgress === 0 && previousMultiplier === 1) return;
    clearPowerCycleResetTimer();
    runtime.current.streakProgress = 0;
    runtime.current.multiplier = 1;
    if (mounted.current) {
      setStreakProgress(0);
      setMultiplier(1);
    }
  }

  function celebrateSuccessfulTurn(turnId: number) {
    if (runtime.current.rewardedTurns.has(turnId)) return;
    runtime.current.rewardedTurns.add(turnId);
    if (!mounted.current) return;
    addPower();
  }

  function celebrateGuidedSuggestion() {
    const suggestionId = runtime.current.suggestionRequestId;
    if (runtime.current.rewardedGuidedSuggestions.has(suggestionId)) return;
    runtime.current.rewardedGuidedSuggestions.add(suggestionId);
    addPower();
  }

  function putLatestMessage(message: ConversationMessage) {
    if (!mounted.current) return;
    setLatestMessages((current) => [...current.filter((item) => item.role !== message.role), message]
      .sort((left, right) => left.id - right.id));
  }

  function updateLatestMessage(id: number, update: Partial<ConversationMessage>) {
    if (!mounted.current) return;
    setLatestMessages((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
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

  async function prefetchSuggestion(sessionId: string, transcript: TranscriptEntry[]) {
    if (runtime.current.mode !== GUIDED_MODE) return;
    const requestId = ++runtime.current.suggestionRequestId;
    runtime.current.suggestionReadyForTurn = false;
    runtime.current.guidedSuggestion = null;
    runtime.current.guidedMatchedWordCount = 0;
    if (mounted.current) setGuidedCoach((current) => ({
      ...current,
      suggestion: null,
      suggestionStatus: "loading",
      matchedWordCount: 0,
      speechComplete: false,
      asrStatus: "idle"
    }));
    for (
      let attempt = 0;
      mounted.current && requestId === runtime.current.suggestionRequestId && attempt < SUGGESTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const suggestion = await suggestResponse(sessionId, transcript);
        if (!mounted.current || runtime.current.mode !== GUIDED_MODE) return;
        if (requestId !== runtime.current.suggestionRequestId) return;
        runtime.current.guidedSuggestion = suggestion;
        runtime.current.suggestionReadyForTurn = true;
        setGuidedCoach((current) => ({
          ...current,
          suggestion,
          suggestionStatus: "ready",
          speechComplete: false
        }));
        scheduleBrowserAsr();
        return;
      } catch {
        if (!mounted.current || requestId !== runtime.current.suggestionRequestId) return;
        if (attempt === SUGGESTION_ATTEMPTS - 1) {
          setGuidedCoach((current) => ({
            ...current,
            suggestionStatus: "error",
            asrStatus: "error"
          }));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, SUGGESTION_RETRY_DELAY));
      }
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
    for (const item of timing) {
      boundary = Math.min(text.length, boundary + item.text.length);
      if (item.startMs <= elapsed) {
        updateLatestMessage(id, { highlightedCharacters: boundary });
      } else {
        const highlightedCharacters = boundary;
        runtime.current.avatarKaraokeTimers.push(setTimeout(() => {
          if (runtime.current.agentState === "speaking") updateLatestMessage(id, { highlightedCharacters });
        }, item.startMs - elapsed));
      }
    }
  }

  function completeAvatarKaraoke() {
    cancelAvatarKaraoke();
    if (mounted.current) setLatestMessages((current) => current.map((item) => item.role === "assistant"
      ? { ...item, highlightedCharacters: item.text.length }
      : item));
  }

  function shouldRunBrowserAsr() {
    return runtime.current.mode === GUIDED_MODE
      && runtime.current.connected
      && runtime.current.agentState === "listening"
      && runtime.current.suggestionReadyForTurn
      && !runtime.current.asrAwaitingResponse
      && !runtime.current.asrManualRetryRequired
      && !runtime.current.finish
      && !runtime.current.expectedDisconnect;
  }

  function sendCompletedGuidedSpeech(match: SuggestedSpeechMatch) {
    const suggestion = runtime.current.guidedSuggestion?.response ?? "";
    const submittedText = guidedSubmissionText({
      awaitingResponse: runtime.current.asrAwaitingResponse,
      match,
      suggestion
    });
    if (!submittedText) return;
    const view = runtime.current.view;
    if (!view || !runtime.current.connected) {
      runtime.current.asrManualRetryRequired = true;
      stopBrowserAsr();
      if (mounted.current) {
        setGuidedCoach((current) => ({ ...current, asrStatus: "error" }));
        setError("Caspian is not ready to receive the guided response. Retry in a moment.");
      }
      return;
    }
    if (mounted.current) setGuidedCoach((current) => ({
      ...current,
      matchedWordCount: match.matchedWordCount,
      speechComplete: true,
      asrStatus: "sending"
    }));
    runtime.current.asrAwaitingResponse = true;
    runtime.current.pendingGuidedScript = submittedText;
    stopBrowserAsr(false);
    try {
      setPersonaMuted(false);
      submitGuidedText(view, submittedText);
      celebrateGuidedSuggestion();
    } catch (reason) {
      runtime.current.asrAwaitingResponse = false;
      runtime.current.pendingGuidedScript = null;
      runtime.current.asrManualRetryRequired = true;
      stopBrowserAsr();
      if (mounted.current) {
        setGuidedCoach((current) => ({ ...current, asrStatus: "error" }));
        setError(message(reason, "Caspian could not receive the guided response. Retry in a moment."));
      }
      return;
    }
    if (mounted.current) setGuidedCoach((current) => ({ ...current, asrStatus: "waiting" }));
    clearGuidedResponseTimer();
    runtime.current.guidedResponseTimer = setTimeout(() => {
      runtime.current.guidedResponseTimer = null;
      if (!runtime.current.asrAwaitingResponse) return;
      runtime.current.asrAwaitingResponse = false;
      runtime.current.pendingGuidedScript = null;
      runtime.current.asrManualRetryRequired = true;
      setPersonaMuted(true);
      if (mounted.current) {
        setGuidedCoach((current) => ({ ...current, asrStatus: "error" }));
        setError("Caspian did not respond. Retry the guided response.");
      }
    }, GUIDED_RESPONSE_TIMEOUT);
  }

  function scheduleRecognizedSpeechCommit(match: SuggestedSpeechMatch) {
    clearAsrCommitTimer();
    if (!match.complete) return;
    runtime.current.asrCommitTimer = setTimeout(() => {
      runtime.current.asrCommitTimer = null;
      sendCompletedGuidedSpeech(match);
    }, ASR_COMPLETE_COMMIT_DELAY);
  }

  function configureRecognition(recognition: BrowserSpeechRecognition) {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "es-ES";
    recognition.onstart = () => {
      if (runtime.current.mode !== GUIDED_MODE || runtime.current.recognition !== recognition) {
        try {
          recognition.abort();
        } catch { /* The stale recognizer is already stopped. */ }
        return;
      }
      runtime.current.recognitionRunning = true;
      setPersonaMuted(true);
      if (mounted.current) setGuidedCoach((current) => ({ ...current, asrStatus: "listening" }));
    };
    recognition.onresult = (event) => {
      if (runtime.current.mode !== GUIDED_MODE || runtime.current.recognition !== recognition) return;
      const suggestion = runtime.current.guidedSuggestion?.response ?? "";
      let committedMatch: SuggestedSpeechMatch | null = null;
      let previewMatch: SuggestedSpeechMatch | null = null;
      let committedWordCount = runtime.current.guidedMatchedWordCount;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (!text.trim()) continue;
        if (result.isFinal) {
          committedMatch = advanceSuggestedSpeechProgress(text, suggestion, committedWordCount);
          committedWordCount = committedMatch.matchedWordCount;
          previewMatch = null;
        } else {
          previewMatch = advanceSuggestedSpeechProgress(text, suggestion, committedWordCount);
        }
      }
      const visibleMatch = previewMatch ?? committedMatch;
      if (!visibleMatch) return;
      runtime.current.guidedMatchedWordCount = visibleMatch.matchedWordCount;
      if (mounted.current) setGuidedCoach((current) => (
        current.matchedWordCount === visibleMatch.matchedWordCount
          && current.speechComplete === visibleMatch.complete
          ? current
          : {
              ...current,
              matchedWordCount: visibleMatch.matchedWordCount,
              speechComplete: visibleMatch.complete
            }
      ));
      if (committedMatch) {
        clearAsrCommitTimer();
        if (committedMatch.complete) scheduleRecognizedSpeechCommit(committedMatch);
      }
    };
    recognition.onerror = (event) => {
      if (runtime.current.mode !== GUIDED_MODE || runtime.current.recognition !== recognition) return;
      runtime.current.recognitionRunning = false;
      clearAsrCommitTimer();
      if (event.error === "aborted" || event.error === "no-speech") return;
      setPersonaMuted(true);
      runtime.current.asrManualRetryRequired = true;
      const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
      if (mounted.current) {
        setGuidedCoach((current) => ({ ...current, asrStatus: blocked ? "unsupported" : "error" }));
        if (!blocked) setError("Browser speech recognition stopped. Use the retry button or change mode.");
      }
    };
    recognition.onend = () => {
      if (runtime.current.mode !== GUIDED_MODE || runtime.current.recognition !== recognition) return;
      runtime.current.recognitionRunning = false;
      if (mounted.current) {
        setGuidedCoach((current) => current.matchedWordCount === runtime.current.guidedMatchedWordCount
          ? current
          : { ...current, matchedWordCount: runtime.current.guidedMatchedWordCount, speechComplete: false });
      }
      if (!shouldRunBrowserAsr()) return;
      clearRecognitionRestartTimer();
      runtime.current.recognitionRestartTimer = setTimeout(() => {
        runtime.current.recognitionRestartTimer = null;
        startBrowserAsr();
      }, ASR_RESTART_DELAY);
    };
  }

  function startBrowserAsr() {
    if (!shouldRunBrowserAsr() || runtime.current.recognitionRunning) return;
    clearRecognitionRestartTimer();
    const Recognition = browserSpeechRecognition();
    if (!Recognition) {
      runtime.current.asrManualRetryRequired = true;
      if (mounted.current) setGuidedCoach((current) => ({ ...current, asrStatus: "unsupported" }));
      return;
    }
    const recognition = runtime.current.recognition ?? new Recognition();
    if (!runtime.current.recognition) {
      runtime.current.recognition = recognition;
      configureRecognition(recognition);
    }
    try {
      recognition.start();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "InvalidStateError") return;
      setPersonaMuted(true);
      if (mounted.current) setGuidedCoach((current) => ({ ...current, asrStatus: "error" }));
    }
  }

  function scheduleBrowserAsr() {
    if (!shouldRunBrowserAsr()) return;
    clearRecognitionRestartTimer();
    runtime.current.recognitionRestartTimer = setTimeout(() => {
      runtime.current.recognitionRestartTimer = null;
      startBrowserAsr();
    }, ASR_RESTART_DELAY);
  }

  function retryBrowserAsr() {
    if (runtime.current.asrAwaitingResponse) return;
    if (!runtime.current.suggestionReadyForTurn) {
      const session = runtime.current.session;
      if (session && runtime.current.transcript.at(-1)?.role === "assistant") {
        void prefetchSuggestion(session.sessionId, [...runtime.current.transcript]);
      }
      return;
    }
    clearGuidedResponseTimer();
    runtime.current.pendingGuidedScript = null;
    runtime.current.asrManualRetryRequired = false;
    runtime.current.guidedMatchedWordCount = 0;
    resetAsrCapture();
    stopBrowserAsr();
    if (mounted.current) {
      setError(null);
      setGuidedCoach((current) => ({
        ...current,
        matchedWordCount: 0,
        speechComplete: false,
        asrStatus: "idle"
      }));
    }
    scheduleBrowserAsr();
  }

  function syncModeInput() {
    const guided = runtime.current.mode === GUIDED_MODE;
    setPersonaMuted(personaShouldBeMuted(runtime.current.mode));
    if (guided) {
      scheduleBrowserAsr();
    }
    else {
      stopBrowserAsr();
      runtime.current.asrAwaitingResponse = false;
      clearGuidedResponseTimer();
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
            syncModeInput();
            startSessionTimer();
          }
        },
        onAgentStateChange: (state) => {
          runtime.current.agentState = state;
          if (state === "speaking") {
            clearGuidedResponseTimer();
            runtime.current.avatarSpeechStartedAt = performance.now();
            stopBrowserAsr();
          } else {
            completeAvatarKaraoke();
            scheduleBrowserAsr();
          }
        },
        onTranscript: (entry) => {
          const rawText = entry.text.trim();
          const rawTiming = (entry.timing ?? []) as AvatarTiming[];
          const acceptedText = entry.role === "assistant"
            ? visiblePersonaText(rawText)
            : learnerTranscriptText({
                mode: runtime.current.mode,
                pendingGuidedScript: runtime.current.pendingGuidedScript,
                providerText: rawText
              });
          if (entry.role === "user" && !acceptedText) return;
          const item: TranscriptEntry = {
            role: entry.role,
            text: acceptedText ?? ""
          };
          if (entry.role === "user" && runtime.current.mode === GUIDED_MODE) {
            runtime.current.pendingGuidedScript = null;
          }
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
            clearGuidedResponseTimer();
            runtime.current.asrAwaitingResponse = false;
            if (runtime.current.mode === GUIDED_MODE) setPersonaMuted(true);
            animateAvatarTranscript(id, item.text, timing);
            const transcript = [...runtime.current.transcript];
            void prefetchSuggestion(session.sessionId, transcript);
            return;
          }
          const turnId = ++runtime.current.turns;
          if (mounted.current) {
            setDisplayed((current) => current && turnId > current.value.turnId
              ? { ...current, canFade: true }
              : current);
          }
          const transcript = [...runtime.current.transcript];
          const turnMode = runtime.current.mode;
          runtime.current.queue = runtime.current.queue.then(async () => {
            let failure: unknown;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const value = await submitTurn(session.sessionId, turnId, transcript);
                if (mounted.current) {
                  setError(null);
                  if (turnMode === FREESTYLE_MODE) {
                    if (value.feedback === "Great Job!") {
                      celebrateSuccessfulTurn(value.turnId);
                    } else if (!runtime.current.rewardedTurns.has(value.turnId)) {
                      resetPower();
                    }
                  }
                  if (turnMode === FREESTYLE_MODE && runtime.current.mode === FREESTYLE_MODE) {
                    setDisplayed({
                      value,
                      canFade: runtime.current.turns > value.turnId
                    });
                  }
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
          if (!runtime.current.connected) {
            failStartup(new Error("Avatar disconnected during startup."));
            return;
          }
          stopBrowserAsr();
          void finish(false);
        },
        onError: (reason) => fail(avatarError(reason))
      });
      runtime.current.view = view;
      syncModeInput();
      await view.connect();
      if (view.status !== "connected") throw new Error("Avatar failed to connect.");
    } catch (reason) {
      fail(reason);
    }
  }

  function setMode(next: ConversationModeId) {
    if (runtime.current.mode === next) return false;
    if (runtime.current.asrAwaitingResponse) return false;
    runtime.current.mode = next;
    runtime.current.suggestionRequestId += 1;
    runtime.current.guidedMatchedWordCount = 0;
    runtime.current.pendingGuidedScript = null;
    setModeState(next);
    if (runtime.current.view) syncModeInput();

    if (next === GUIDED_MODE) {
      runtime.current.asrManualRetryRequired = false;
      runtime.current.suggestionReadyForTurn = false;
      setDisplayed(null);
      setGuidedCoach(emptyCoach());
      const session = runtime.current.session;
      const hasTutorTurn = runtime.current.transcript.some((entry) => entry.role === "assistant");
      if (session && hasTutorTurn) void prefetchSuggestion(session.sessionId, [...runtime.current.transcript]);
      scheduleBrowserAsr();
    } else {
      runtime.current.asrAwaitingResponse = false;
      clearGuidedResponseTimer();
      setGuidedCoach(emptyCoach());
    }
    return true;
  }

  function finish(disconnect: boolean): Promise<void> {
    if (runtime.current.finish) return runtime.current.finish;
    clearSessionTimer();
    if (mounted.current) setEnding(true);
    clearGuidedResponseTimer();
    stopBrowserAsr();
    if (disconnect) release();
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
    guidedCoach,
    ending,
    error,
    feedback: displayed?.value ?? null,
    feedbackCanFade: displayed?.canFade ?? false,
    finish: () => void finish(true),
    guidedMode: mode === GUIDED_MODE,
    latestMessages,
    mode,
    multiplier,
    powerCelebrations,
    sessionTimeRemainingMs,
    streakProgress,
    setMode,
    retryGuidedAsr: retryBrowserAsr,
    startupFailed,
    clearFeedback: (turnId: number) => setDisplayed((current) => current?.value.turnId === turnId ? null : current)
  };
}
