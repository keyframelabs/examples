import type {
  SessionDetails,
  VoiceAgentDetails as PersonaVoiceAgentDetails
} from "@keyframelabs/elements";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";
const INTERVIEW_CATALOG_RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const;

type KeyframeSessionDetails = SessionDetails;

type VoiceAgentDetails = PersonaVoiceAgentDetails & {
  type: "elevenlabs";
  agent_id: string;
  signed_url: string;
  dynamic_variables: {
    interview_packet: string;
  };
};

export type LiveSessionResponse = {
  sessionDetails: KeyframeSessionDetails;
  voiceAgentDetails: VoiceAgentDetails;
  conversationId?: string;
};

export type InterviewPacket = {
  packetId: string;
  title: string;
  skillLevel: "Intern" | "Junior" | "Senior";
};

export async function getInterviewPackets(
  signal?: AbortSignal
): Promise<InterviewPacket[]> {
  const url = `${API_BASE_URL}/api/interviews`;
  const response = await fetchInterviewCatalog(url, signal);
  const payload = await parseResponse(response);
  if (!isRecord(payload) || !Array.isArray(payload.interviews)) {
    throw new Error("Interview catalog response was invalid.");
  }

  const interviews = payload.interviews.filter(isInterviewPacket);
  if (interviews.length !== payload.interviews.length) {
    throw new Error("Interview catalog response was invalid.");
  }
  return interviews;
}

async function fetchInterviewCatalog(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  let retryIndex = 0;

  while (true) {
    try {
      return signal ? await fetch(url, { signal }) : await fetch(url);
    } catch (error) {
      const retryDelay = INTERVIEW_CATALOG_RETRY_DELAYS_MS[retryIndex];
      if (
        retryDelay === undefined ||
        signal?.aborted ||
        !(error instanceof TypeError)
      ) {
        throw error;
      }

      retryIndex += 1;
      await waitForRetry(retryDelay, signal);
    }
  }
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }

  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("The request was aborted.", "AbortError")
  );
}

export async function createLiveSession(
  packetId: string
): Promise<LiveSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packetId })
  });

  const payload = await parseResponse(response);
  if (!isLiveSessionResponse(payload)) {
    throw new Error("Session response was missing live avatar credentials.");
  }

  return payload;
}

function isInterviewPacket(value: unknown): value is InterviewPacket {
  if (!isRecord(value)) return false;

  return (
    typeof value.packetId === "string" &&
    typeof value.title === "string" &&
    (value.skillLevel === "Intern" ||
      value.skillLevel === "Junior" ||
      value.skillLevel === "Senior")
  );
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
    && typeof value.voiceAgentDetails.agent_id === "string"
    && isRecord(value.voiceAgentDetails.dynamic_variables)
    && typeof value.voiceAgentDetails.dynamic_variables.interview_packet === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
