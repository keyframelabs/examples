import type { SessionDetails, VoiceAgentDetails } from "@keyframelabs/elements";

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";
const CATALOG_RETRY_DELAYS_MS = [250, 500, 1000, 2000];

export type Scenario = {
  scenarioId: string;
  title: string;
};

export type TranscriptEntry = { role: "user" | "assistant"; text: string };
export type Feedback = {
  feedback: "Great Job!" | "Needs Improvement" | "That wasn't nice.";
  suggestionSpanish: string | null;
  suggestionEnglish: string | null;
  reason: string;
};
export type TurnFeedback = Feedback & { turnId: number };
export type BilingualSegment = {
  spanish: string;
  english: string;
};
export type TranscriptTranslation = {
  translation: string;
  segments: BilingualSegment[];
};
export type SuggestedResponse = {
  response: string;
  translation: string;
  segments: BilingualSegment[];
};
export type LiveSessionResponse = {
  sessionId: string;
  persona: {
    sessionDetails: SessionDetails;
    voiceAgentDetails: VoiceAgentDetails & {
      type: "elevenlabs";
      agent_id: string;
      signed_url: string;
    };
    dynamicVariables: {
      scenario_prompt: string;
      scenario_opening_message: string;
    };
  };
};
export type LearnerTurn = { turnId: number; text: string; feedback: Feedback | null };
export type SessionSummary = { scenarioId: string; scenarioTitle: string; learnerTurns: LearnerTurn[] };

export async function getScenarios(signal?: AbortSignal): Promise<Scenario[]> {
  const fetchCatalog = async () => {
    const payload = await request<{ scenarios?: Scenario[] }>("/api/scenarios", { signal });
    if (!Array.isArray(payload.scenarios)) throw new Error("Scenario catalog was invalid.");
    return payload.scenarios;
  };

  for (const retryDelay of CATALOG_RETRY_DELAYS_MS) {
    try {
      return await fetchCatalog();
    } catch (error) {
      if (signal?.aborted || !(error instanceof TypeError)) throw error;
      await sleep(retryDelay, signal);
    }
  }

  return fetchCatalog();
}

export const createSession = (scenarioId: string) => post<LiveSessionResponse>("/api/sessions", { scenarioId });
export const submitTurn = (sessionId: string, turnId: number, transcript: TranscriptEntry[]) =>
  post<TurnFeedback>(`/api/sessions/${sessionId}/turns`, { turnId, transcript });
export const translateTranscript = (sessionId: string, text: string) =>
  post<TranscriptTranslation>(`/api/sessions/${sessionId}/translations`, { text });
export const suggestResponse = (sessionId: string, transcript: TranscriptEntry[]) =>
  post<SuggestedResponse>(`/api/sessions/${sessionId}/suggestions`, { transcript });
export const endSession = (sessionId: string, transcript: TranscriptEntry[], keepalive = false) =>
  post<SessionSummary>(`/api/sessions/${sessionId}/end`, { transcript }, keepalive);

const post = <T,>(path: string, body: object, keepalive = false) => request<T>(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  keepalive
});

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error("Server returned a non-JSON response.");
    payload = {};
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new Error(typeof detail === "string" ? detail : `Request failed with ${response.status}.`);
  }
  return payload as T;
}

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, delayMs);
    function finish() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
  });
}
