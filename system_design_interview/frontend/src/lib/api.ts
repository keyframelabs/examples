import type {
  SessionDetails,
  VoiceAgentDetails as PersonaVoiceAgentDetails
} from "@keyframelabs/elements";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8788";
// The dev server may still be starting when the page first loads.
const CATALOG_RETRY_DELAYS_MS = [250, 500, 1000, 2000];

type VoiceAgentDetails = PersonaVoiceAgentDetails & {
  type: "elevenlabs";
  agent_id: string;
  signed_url: string;
  dynamic_variables: {
    interview_packet: string;
  };
};

export type LiveSessionResponse = {
  sessionDetails: SessionDetails;
  voiceAgentDetails: VoiceAgentDetails;
};

export type InterviewPacket = {
  packetId: string;
  title: string;
  skillLevel: "Intern" | "Junior" | "Senior";
};

export async function getInterviewPackets(
  signal?: AbortSignal
): Promise<InterviewPacket[]> {
  const fetchCatalog = async () => {
    const response = await fetch(`${API_BASE_URL}/api/interviews`, { signal });
    const payload = (await parseResponse(response)) as {
      interviews: InterviewPacket[];
    };
    return payload.interviews;
  };

  for (const retryDelay of CATALOG_RETRY_DELAYS_MS) {
    try {
      return await fetchCatalog();
    } catch (error) {
      // Only network failures are worth retrying; HTTP and abort errors are
      // surfaced immediately.
      if (signal?.aborted || !(error instanceof TypeError)) throw error;
      await sleep(retryDelay, signal);
    }
  }

  return fetchCatalog();
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

async function parseResponse(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

/** Resolves after the delay, or immediately when the signal aborts. */
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
