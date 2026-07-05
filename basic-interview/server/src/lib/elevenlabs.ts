import type { ElevenLabsPromptDebug, VoiceAgentDetails } from "@kfl-interview/shared";

import { config, requireEnv } from "./config";
import { buildDynamicVariables } from "./prompts";
import type { InterviewRecord } from "./store";
import { formatTranscriptLine, hasTranscriptText } from "./transcripts";

type SignedUrlResponse = {
  signed_url: string;
  conversation_id?: string;
};

type ElevenLabsAgentUpdatePayload = {
  conversation_config: {
    agent: {
      first_message: string;
      disable_first_message_interruptions: true;
      prompt: {
        prompt: string;
      };
    };
  };
};

const TRANSCRIPT_FETCH_ATTEMPTS = 6;
const TRANSCRIPT_FETCH_DELAY_MS = 1_250;

export async function createElevenLabsVoiceAgentDetails(record: InterviewRecord, prompt: string): Promise<{
  voiceAgentDetails: VoiceAgentDetails;
  conversationId?: string;
}> {
  const apiKey = requireEnv(config.elevenLabsApiKey, "ELEVENLABS_API_KEY");
  const agentId = requireEnv(config.elevenLabsAgentId, "ELEVENLABS_AGENT_ID");

  await updateElevenLabsAgent({
    apiKey,
    agentId,
    prompt,
    firstMessage: record.packet.interviewer.openingScript
  });

  const signed = await getSignedUrl({ apiKey, agentId });
  const dynamicVariables = buildDynamicVariables({
    candidateName: record.candidateName,
    packet: record.packet,
    jobDescriptionText: record.jobDescriptionText,
    resumeText: record.resumeText
  });

  return {
    conversationId: signed.conversation_id,
    voiceAgentDetails: {
      type: "elevenlabs",
      agent_id: agentId,
      signed_url: signed.signed_url,
      dynamic_variables: dynamicVariables,
      dynamicVariables
    }
  };
}

export function buildElevenLabsAgentUpdatePayload(input: {
  prompt: string;
  firstMessage: string;
}): ElevenLabsAgentUpdatePayload {
  return {
    conversation_config: {
      agent: {
        first_message: input.firstMessage,
        disable_first_message_interruptions: true,
        prompt: {
          prompt: input.prompt
        }
      }
    }
  };
}

export function buildElevenLabsPromptDebug(input: {
  prompt: string;
  firstMessage: string;
}): ElevenLabsPromptDebug {
  return {
    firstMessage: input.firstMessage,
    systemPrompt: input.prompt,
    agentUpdatePayload: buildElevenLabsAgentUpdatePayload(input)
  };
}

export async function fetchTranscriptForRecord(record: InterviewRecord, conversationId?: string): Promise<string> {
  const apiKey = requireEnv(config.elevenLabsApiKey, "ELEVENLABS_API_KEY");
  const agentId = requireEnv(config.elevenLabsAgentId, "ELEVENLABS_AGENT_ID");
  const targetConversationId = conversationId ?? record.conversationId ?? await findLatestConversationId({
    apiKey,
    agentId,
    startedAfterUnix: record.sessionStartedAtUnix
  });

  if (!targetConversationId) {
    return "";
  }

  for (let attempt = 0; attempt < TRANSCRIPT_FETCH_ATTEMPTS; attempt += 1) {
    const transcript = await fetchConversationTranscript(apiKey, targetConversationId);
    if (hasTranscriptText(transcript)) {
      return transcript;
    }

    if (attempt < TRANSCRIPT_FETCH_ATTEMPTS - 1) {
      await sleep(TRANSCRIPT_FETCH_DELAY_MS);
    }
  }

  return "";
}

async function fetchConversationTranscript(apiKey: string, conversationId: string): Promise<string> {
  const response = await fetch(`${config.elevenLabsApiBaseUrl}/v1/convai/conversations/${conversationId}`, {
    headers: {
      "xi-api-key": apiKey
    }
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(`ElevenLabs conversation lookup failed: ${extractProviderError(body, response.statusText)}`),
      { status: response.status }
    );
  }

  return extractTranscript(body);
}

async function getSignedUrl(input: { apiKey: string; agentId: string }): Promise<SignedUrlResponse> {
  const url = new URL(`${config.elevenLabsApiBaseUrl}/v1/convai/conversation/get-signed-url`);
  url.searchParams.set("agent_id", input.agentId);
  url.searchParams.set("include_conversation_id", "true");

  const response = await fetch(url, {
    headers: {
      "xi-api-key": input.apiKey
    }
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(`ElevenLabs signed URL request failed: ${extractProviderError(body, response.statusText)}`),
      { status: response.status }
    );
  }

  if (!isRecord(body) || typeof body.signed_url !== "string") {
    throw new Error("ElevenLabs signed URL response did not include signed_url.");
  }

  return {
    signed_url: body.signed_url,
    conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : undefined
  };
}

async function updateElevenLabsAgent(input: {
  apiKey: string;
  agentId: string;
  prompt: string;
  firstMessage: string;
}): Promise<void> {
  const response = await fetch(`${config.elevenLabsApiBaseUrl}/v1/convai/agents/${encodeURIComponent(input.agentId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": input.apiKey
    },
    body: JSON.stringify(buildElevenLabsAgentUpdatePayload({
      prompt: input.prompt,
      firstMessage: input.firstMessage
    }))
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(`ElevenLabs agent update failed: ${extractProviderError(body, response.statusText)}`),
      { status: response.status }
    );
  }
}

async function findLatestConversationId(input: {
  apiKey: string;
  agentId: string;
  startedAfterUnix?: number;
}): Promise<string | undefined> {
  const url = new URL(`${config.elevenLabsApiBaseUrl}/v1/convai/conversations`);
  url.searchParams.set("agent_id", input.agentId);
  url.searchParams.set("page_size", "5");
  url.searchParams.set("summary_mode", "exclude");
  url.searchParams.set("exclude_statuses", "initiated");
  if (input.startedAfterUnix) {
    url.searchParams.set("call_start_after_unix", String(input.startedAfterUnix - 5));
  }

  const response = await fetch(url, {
    headers: {
      "xi-api-key": input.apiKey
    }
  });

  if (!response.ok) {
    return undefined;
  }

  const body = await safeJson(response);
  if (!isRecord(body) || !Array.isArray(body.conversations)) {
    return undefined;
  }

  const first = body.conversations.find(isRecord);
  const id = first?.conversation_id ?? first?.conversationId ?? first?.id;
  return typeof id === "string" ? id : undefined;
}

function extractTranscript(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.transcript)) {
    return "";
  }

  return body.transcript
    .filter(isRecord)
    .map((turn) => {
      const role = firstString(
        turn.role,
        turn.speaker,
        turn.author,
        turn.source,
        turn.type,
        nestedString(turn, "user", "role"),
        nestedString(turn, "agent", "role")
      ) ?? "speaker";
      const message = firstString(
        turn.message,
        turn.text,
        turn.transcript,
        turn.content,
        nestedString(turn, "message", "text"),
        nestedString(turn, "text", "value"),
        nestedString(turn, "user", "message"),
        nestedString(turn, "user", "text"),
        nestedString(turn, "agent", "message"),
        nestedString(turn, "agent", "text")
      ) ?? "";

      return message ? formatTranscriptLine(role, message) : "";
    })
    .filter(Boolean)
    .join("\n");
}

function firstString(...values: unknown[]): string | undefined {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : undefined;
}

function nestedString(value: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = value[key];
  if (!isRecord(nested)) {
    return undefined;
  }

  const nestedValue = nested[nestedKey];
  return typeof nestedValue === "string" ? nestedValue : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function extractProviderError(body: unknown, fallback: string): string {
  if (isRecord(body) && "detail" in body) {
    const detail = body.detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
