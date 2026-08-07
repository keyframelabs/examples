import type { PersonaView } from "@keyframelabs/elements";
import { suggestResponse, type SuggestedResponse, type TranscriptEntry } from "@/lib/api";
import {
  browserSpeechRecognition,
  type BrowserSpeechRecognition
} from "@/lib/browserSpeech";
import type { ConversationModeId } from "@/lib/conversationMode";
import { GUIDED_MODE } from "@/lib/conversationMode";
import {
  advanceSuggestedSpeechProgress,
  type SuggestedSpeechMatch
} from "@/lib/speechMatching";

const ASR_RESTART_DELAY = 150;
const ASR_COMPLETE_COMMIT_DELAY = 350;
const GUIDED_RESPONSE_TIMEOUT = 12_000;
const SUGGESTION_ATTEMPTS = 3;
const SUGGESTION_RETRY_DELAY = 2_000;
type GuidedTimer = "commit" | "response" | "restart";
type RecognitionResultEvent = Parameters<NonNullable<BrowserSpeechRecognition["onresult"]>>[0];
type RecognitionErrorEvent = Parameters<NonNullable<BrowserSpeechRecognition["onerror"]>>[0];

function guidedSubmissionText({
  awaitingResponse,
  match,
  suggestion
}: {
  awaitingResponse: boolean;
  match: SuggestedSpeechMatch;
  suggestion: string;
}): string | null {
  return !awaitingResponse && match.complete ? suggestion : null;
}

function learnerTranscriptText({
  mode,
  pendingGuidedScript,
  providerText
}: {
  mode: ConversationModeId;
  pendingGuidedScript: string | null;
  providerText: string;
}): string | null {
  if (mode === GUIDED_MODE) return pendingGuidedScript?.trim() || null;
  return providerText.trim() || null;
}

function submitGuidedText(
  view: { sendText?: PersonaView["sendText"] },
  text: string
): void {
  if (typeof view.sendText !== "function") {
    throw new Error("Guided text input is unavailable. Refresh the page and retry.");
  }
  view.sendText(text);
}

function synchronizePersonaMute(
  view: Pick<PersonaView, "isMuted" | "toggleMute">,
  muted: boolean
): boolean {
  if (view.isMuted === muted) return false;
  view.toggleMute();
  return true;
}

export type GuidedCoach = {
  suggestion: SuggestedResponse | null;
  suggestionStatus: "idle" | "loading" | "ready" | "error";
  matchedWordCount: number;
  speechComplete: boolean;
  asrStatus: "idle" | "listening" | "sending" | "waiting" | "unsupported" | "error";
};

export const emptyGuidedCoach = (): GuidedCoach => ({
  suggestion: null,
  suggestionStatus: "idle",
  matchedWordCount: 0,
  speechComplete: false,
  asrStatus: "idle"
});

type GuidedSessionContext = {
  agentState: "listening" | "speaking";
  connected: boolean;
  expectedDisconnect: boolean;
  finishing: boolean;
  sessionId: string | null;
  transcript: TranscriptEntry[];
  view: PersonaView | null;
};

export type GuidedSessionController = {
  acceptLearnerTranscript: () => void;
  learnerTranscript: (providerText: string) => string | null;
  mode: () => ConversationModeId;
  onAgentStateChange: (state: "listening" | "speaking") => void;
  onAssistantTranscript: () => void;
  release: () => void;
  retry: () => void;
  setMode: (next: ConversationModeId) => boolean;
  stop: () => void;
  syncInput: () => void;
};

export function createGuidedSession({
  active,
  context,
  rewardSuggestion,
  setError,
  updateCoach
}: {
  active: () => boolean;
  context: () => GuidedSessionContext;
  rewardSuggestion: (suggestionId: number) => void;
  setError: (error: string | null) => void;
  updateCoach: (update: (current: GuidedCoach) => GuidedCoach) => void;
}, initialMode: ConversationModeId): GuidedSessionController {
  let asrAwaitingResponse = false;
  let asrManualRetryRequired = false;
  let guidedMatchedWordCount = 0;
  let guidedSuggestion: SuggestedResponse | null = null;
  let mode = initialMode;
  let pendingGuidedScript: string | null = null;
  let recognition: BrowserSpeechRecognition | null = null;
  let recognitionRunning = false;
  let suggestionReadyForTurn = false;
  let suggestionRequestId = 0;
  const timers: Record<GuidedTimer, ReturnType<typeof setTimeout> | null> = {
    commit: null,
    response: null,
    restart: null
  };

  function patchCoach(patch: Partial<GuidedCoach>) {
    updateCoach((current) => ({ ...current, ...patch }));
  }

  function setPersonaMuted(muted: boolean) {
    const view = context().view;
    if (view) synchronizePersonaMute(view, muted);
  }

  function clearTimer(timer: GuidedTimer) {
    const value = timers[timer];
    if (value) clearTimeout(value);
    timers[timer] = null;
  }

  function stopBrowserAsr(mutePersona = true) {
    clearTimer("restart");
    clearTimer("commit");
    if (mutePersona && mode === GUIDED_MODE) setPersonaMuted(true);
    const current = recognition;
    recognition = null;
    if (!current) return;
    recognitionRunning = false;
    try {
      current.abort();
    } catch { /* The browser may already have stopped recognition. */ }
  }

  function shouldRunBrowserAsr() {
    const current = context();
    return mode === GUIDED_MODE
      && current.connected
      && current.agentState === "listening"
      && suggestionReadyForTurn
      && !asrAwaitingResponse
      && !asrManualRetryRequired
      && !current.finishing
      && !current.expectedDisconnect;
  }

  function scheduleBrowserAsr() {
    if (!shouldRunBrowserAsr()) return;
    clearTimer("restart");
    timers.restart = setTimeout(() => {
      timers.restart = null;
      startBrowserAsr();
    }, ASR_RESTART_DELAY);
  }

  function sendCompletedGuidedSpeech(match: SuggestedSpeechMatch) {
    const submittedText = guidedSubmissionText({
      awaitingResponse: asrAwaitingResponse,
      match,
      suggestion: guidedSuggestion?.response ?? ""
    });
    if (!submittedText) return;
    const current = context();
    if (!current.view || !current.connected) {
      asrManualRetryRequired = true;
      stopBrowserAsr();
      patchCoach({ asrStatus: "error" });
      setError("Caspian is not ready to receive the guided response. Retry in a moment.");
      return;
    }
    patchCoach({
      matchedWordCount: match.matchedWordCount,
      speechComplete: true,
      asrStatus: "sending"
    });
    asrAwaitingResponse = true;
    pendingGuidedScript = submittedText;
    stopBrowserAsr(false);
    try {
      setPersonaMuted(false);
      submitGuidedText(current.view, submittedText);
      rewardSuggestion(suggestionRequestId);
    } catch (reason) {
      asrAwaitingResponse = false;
      pendingGuidedScript = null;
      asrManualRetryRequired = true;
      stopBrowserAsr();
      patchCoach({ asrStatus: "error" });
      setError(reason instanceof Error
        ? reason.message
        : "Caspian could not receive the guided response. Retry in a moment.");
      return;
    }
    patchCoach({ asrStatus: "waiting" });
    clearTimer("response");
    timers.response = setTimeout(() => {
      timers.response = null;
      if (!asrAwaitingResponse) return;
      asrAwaitingResponse = false;
      pendingGuidedScript = null;
      asrManualRetryRequired = true;
      setPersonaMuted(true);
      patchCoach({ asrStatus: "error" });
      setError("Caspian did not respond. Retry the guided response.");
    }, GUIDED_RESPONSE_TIMEOUT);
  }

  function scheduleRecognizedSpeechCommit(match: SuggestedSpeechMatch) {
    clearTimer("commit");
    if (!match.complete) return;
    timers.commit = setTimeout(() => {
      timers.commit = null;
      sendCompletedGuidedSpeech(match);
    }, ASR_COMPLETE_COMMIT_DELAY);
  }

  function handleRecognitionStart(current: BrowserSpeechRecognition) {
    if (mode !== GUIDED_MODE || recognition !== current) {
      try {
        current.abort();
      } catch { /* The stale recognizer is already stopped. */ }
      return;
    }
    recognitionRunning = true;
    setPersonaMuted(true);
    patchCoach({ asrStatus: "listening" });
  }

  function handleRecognitionResult(current: BrowserSpeechRecognition, event: RecognitionResultEvent) {
    if (mode !== GUIDED_MODE || recognition !== current) return;
    const suggestion = guidedSuggestion?.response ?? "";
    let committedMatch: SuggestedSpeechMatch | null = null;
    let previewMatch: SuggestedSpeechMatch | null = null;
    let committedWordCount = guidedMatchedWordCount;
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
    guidedMatchedWordCount = visibleMatch.matchedWordCount;
    updateCoach((coach) => coach.matchedWordCount === visibleMatch.matchedWordCount
      && coach.speechComplete === visibleMatch.complete
      ? coach
      : {
          ...coach,
          matchedWordCount: visibleMatch.matchedWordCount,
          speechComplete: visibleMatch.complete
        });
    if (committedMatch) {
      clearTimer("commit");
      if (committedMatch.complete) scheduleRecognizedSpeechCommit(committedMatch);
    }
  }

  function handleRecognitionError(current: BrowserSpeechRecognition, event: RecognitionErrorEvent) {
    if (mode !== GUIDED_MODE || recognition !== current) return;
    recognitionRunning = false;
    clearTimer("commit");
    if (event.error === "aborted" || event.error === "no-speech") return;
    setPersonaMuted(true);
    asrManualRetryRequired = true;
    const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
    patchCoach({ asrStatus: blocked ? "unsupported" : "error" });
    if (!blocked) setError("Browser speech recognition stopped. Use the retry button or change mode.");
  }

  function handleRecognitionEnd(current: BrowserSpeechRecognition) {
    if (mode !== GUIDED_MODE || recognition !== current) return;
    recognitionRunning = false;
    updateCoach((coach) => coach.matchedWordCount === guidedMatchedWordCount
      ? coach
      : { ...coach, matchedWordCount: guidedMatchedWordCount, speechComplete: false });
    scheduleBrowserAsr();
  }

  function configureRecognition(current: BrowserSpeechRecognition) {
    current.continuous = true;
    current.interimResults = true;
    current.lang = "es-ES";
    current.onstart = () => handleRecognitionStart(current);
    current.onresult = (event) => handleRecognitionResult(current, event);
    current.onerror = (event) => handleRecognitionError(current, event);
    current.onend = () => handleRecognitionEnd(current);
  }

  function startBrowserAsr() {
    if (!shouldRunBrowserAsr() || recognitionRunning) return;
    clearTimer("restart");
    const Recognition = browserSpeechRecognition();
    if (!Recognition) {
      asrManualRetryRequired = true;
      patchCoach({ asrStatus: "unsupported" });
      return;
    }
    const current = recognition ?? new Recognition();
    if (!recognition) {
      recognition = current;
      configureRecognition(current);
    }
    try {
      current.start();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "InvalidStateError") return;
      setPersonaMuted(true);
      patchCoach({ asrStatus: "error" });
    }
  }

  async function prefetchSuggestion() {
    const current = context();
    if (mode !== GUIDED_MODE || !current.sessionId) return;
    const sessionId = current.sessionId;
    const transcript = [...current.transcript];
    const requestId = ++suggestionRequestId;
    suggestionReadyForTurn = false;
    guidedSuggestion = null;
    guidedMatchedWordCount = 0;
    updateCoach((coach) => ({
      ...coach,
      suggestion: null,
      suggestionStatus: "loading",
      matchedWordCount: 0,
      speechComplete: false,
      asrStatus: "idle"
    }));
    for (let attempt = 0; active() && requestId === suggestionRequestId && attempt < SUGGESTION_ATTEMPTS; attempt += 1) {
      try {
        const suggestion = await suggestResponse(sessionId, transcript);
        if (!active() || mode !== GUIDED_MODE || requestId !== suggestionRequestId) return;
        guidedSuggestion = suggestion;
        suggestionReadyForTurn = true;
        patchCoach({ suggestion, suggestionStatus: "ready", speechComplete: false });
        scheduleBrowserAsr();
        return;
      } catch {
        if (!active() || requestId !== suggestionRequestId) return;
        if (attempt === SUGGESTION_ATTEMPTS - 1) {
          patchCoach({ suggestionStatus: "error", asrStatus: "error" });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, SUGGESTION_RETRY_DELAY));
      }
    }
  }

  function syncInput() {
    const guided = mode === GUIDED_MODE;
    setPersonaMuted(guided);
    if (guided) scheduleBrowserAsr();
    else {
      stopBrowserAsr();
      asrAwaitingResponse = false;
      clearTimer("response");
    }
  }

  function retry() {
    if (asrAwaitingResponse) return;
    if (!suggestionReadyForTurn) {
      if (context().transcript.at(-1)?.role === "assistant") void prefetchSuggestion();
      return;
    }
    clearTimer("response");
    pendingGuidedScript = null;
    asrManualRetryRequired = false;
    guidedMatchedWordCount = 0;
    stopBrowserAsr();
    setError(null);
    patchCoach({ matchedWordCount: 0, speechComplete: false, asrStatus: "idle" });
    scheduleBrowserAsr();
  }

  function stop() {
    clearTimer("response");
    stopBrowserAsr();
  }

  function release() {
    suggestionRequestId += 1;
    stop();
  }

  return {
    acceptLearnerTranscript() {
      if (mode === GUIDED_MODE) pendingGuidedScript = null;
    },
    learnerTranscript(providerText) {
      return learnerTranscriptText({ mode, pendingGuidedScript, providerText });
    },
    mode: () => mode,
    onAgentStateChange(state) {
      if (state === "speaking") {
        clearTimer("response");
        stopBrowserAsr();
      } else {
        scheduleBrowserAsr();
      }
    },
    onAssistantTranscript() {
      clearTimer("response");
      asrAwaitingResponse = false;
      if (mode === GUIDED_MODE) setPersonaMuted(true);
      void prefetchSuggestion();
    },
    release,
    retry,
    setMode(next) {
      if (mode === next || asrAwaitingResponse) return false;
      mode = next;
      suggestionRequestId += 1;
      guidedMatchedWordCount = 0;
      pendingGuidedScript = null;
      if (next === GUIDED_MODE) {
        asrManualRetryRequired = false;
        suggestionReadyForTurn = false;
      }
      syncInput();
      updateCoach(() => emptyGuidedCoach());
      if (next === GUIDED_MODE && context().transcript.some((entry) => entry.role === "assistant")) {
        void prefetchSuggestion();
      }
      return true;
    },
    stop,
    syncInput
  };
}
