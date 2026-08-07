import type { SessionDetails, VoiceAgentDetails } from "@keyframelabs/elements";

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";

export type Scenario = {
  scenarioId: string;
  title: string;
  skillLevel: "Beginner" | "Intermediate" | "Advanced";
};

export type TranscriptEntry = { role: "user" | "assistant"; text: string };
export type Feedback = {
  feedback: "Great Job!" | "Needs Improvement" | "That wasn't nice.";
  suggestionSpanish: string | null;
  suggestionEnglish: string | null;
  reason: string;
};
export type TurnFeedback = Feedback & { turnId: number };
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
export type SessionSummary = { scenarioTitle: string; learnerTurns: LearnerTurn[] };

export async function getScenarios(signal?: AbortSignal): Promise<Scenario[]> {
  const payload = await request<{ scenarios?: Scenario[] }>("/api/scenarios", { signal });
  if (!Array.isArray(payload.scenarios)) throw new Error("Scenario catalog was invalid.");
  return payload.scenarios;
}

export const createSession = (scenarioId: string) => post<LiveSessionResponse>("/api/sessions", { scenarioId });
export const submitTurn = (sessionId: string, turnId: number, transcript: TranscriptEntry[]) =>
  post<TurnFeedback>(`/api/sessions/${sessionId}/turns`, { turnId, transcript });
export const translateTranscript = (sessionId: string, text: string) =>
  post<{ translation: string }>(`/api/sessions/${sessionId}/translations`, { text });
export const endSession = (sessionId: string, transcript: TranscriptEntry[]) =>
  post<SessionSummary>(`/api/sessions/${sessionId}/end`, { transcript });

const post = <T,>(path: string, body: object) => request<T>(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
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
