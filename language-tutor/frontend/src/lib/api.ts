import type { SessionDetails, VoiceAgentDetails } from "@keyframelabs/elements";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";

export type Scenario = {
  scenarioId: string;
  title: string;
  description: string;
  imageUrl: string;
};

export type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

export type TurnFeedback = {
  turnId: number;
  feedback: "Great Job!" | "Needs Improvement" | "That wasn't nice.";
  inputEnglish: string;
  suggestionSpanish: string | null;
  suggestionEnglish: string | null;
  reason: string;
};

export type LiveSessionResponse = {
  sessionId: string;
  sessionDetails: SessionDetails;
  voiceAgentDetails: VoiceAgentDetails & {
    type: "elevenlabs";
    agent_id: string;
    signed_url: string;
    dynamic_variables: { scenario_prompt: string };
  };
};

export type SessionSummary = {
  sessionId: string;
  scenario: Scenario;
  transcript: TranscriptEntry[];
  feedback: TurnFeedback[];
  ended: true;
};

export async function getScenarios(signal?: AbortSignal): Promise<Scenario[]> {
  const payload = await request<{ scenarios?: Scenario[] }>("/api/scenarios", { signal });
  if (!Array.isArray(payload.scenarios)) throw new Error("Scenario catalog was invalid.");
  return payload.scenarios;
}

export const createSession = (scenarioId: string) =>
  post<LiveSessionResponse>("/api/sessions", { scenarioId });

export const submitTurn = (
  sessionId: string,
  turnId: number,
  turn: TranscriptEntry,
  transcript: TranscriptEntry[]
): Promise<TurnFeedback> =>
  post(`/api/sessions/${sessionId}/turns`, { turnId, turn, transcript });

export const endSession = (
  sessionId: string,
  transcript: TranscriptEntry[]
): Promise<SessionSummary> => post(`/api/sessions/${sessionId}/end`, { transcript });

function post<T>(path: string, body: object): Promise<T> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : `Request failed with ${response.status}.`);
  }
  return payload as T;
}
