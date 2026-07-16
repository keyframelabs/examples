import type {
  SessionDetails,
  VoiceAgentDetails as PersonaVoiceAgentDetails
} from "@keyframelabs/elements";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";

export type KeyframeSessionDetails = SessionDetails;

export type VoiceAgentDetails = PersonaVoiceAgentDetails & {
  type: "elevenlabs";
  agent_id: string;
  signed_url: string;
};

export type LiveSessionResponse = {
  sessionDetails: KeyframeSessionDetails;
  voiceAgentDetails: VoiceAgentDetails;
  conversationId?: string;
};

export async function createLiveSession(): Promise<LiveSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  const payload = await parseResponse(response);
  if (!isLiveSessionResponse(payload)) {
    throw new Error("Session response was missing live avatar credentials.");
  }

  return payload;
}

async function parseResponse(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function isLiveSessionResponse(value: unknown): value is LiveSessionResponse {
  if (!isRecord(value) || !isRecord(value.sessionDetails) || !isRecord(value.voiceAgentDetails)) {
    return false;
  }

  return typeof value.sessionDetails.server_url === "string"
    && typeof value.sessionDetails.participant_token === "string"
    && typeof value.sessionDetails.agent_identity === "string"
    && value.voiceAgentDetails.type === "elevenlabs"
    && typeof value.voiceAgentDetails.signed_url === "string"
    && typeof value.voiceAgentDetails.agent_id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
