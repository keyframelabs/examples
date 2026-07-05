import {
  FeedbackArtifactSchema,
  InterviewPacketSchema,
  type FeedbackArtifact,
  type InterviewPacket
} from "@kfl-interview/shared";

import { config } from "./config";
import { feedbackArtifactJsonSchema, interviewPacketJsonSchema } from "./openai-schemas";
import { buildFeedbackPrompt, buildInterviewPacketPrompt, type PromptMessage } from "./prompts";
import { hasTranscriptText } from "./transcripts";

type GeminiHttpResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  bodyJson?: unknown;
};

export function isGeminiConfigured(): boolean {
  return Boolean(config.geminiApiKey);
}

export async function createGeminiInterviewPacket(input: {
  candidateName: string;
  jobDescriptionText: string;
  resumeText?: string;
}): Promise<InterviewPacket> {
  if (!config.geminiApiKey) {
    throw new Error("Gemini is not configured.");
  }

  const parsed = await generateGeminiJson({
    prompt: buildInterviewPacketPrompt(input),
    schemaName: "interview_packet",
    schema: interviewPacketJsonSchema
  });

  return InterviewPacketSchema.parse(parsed);
}

export async function createGeminiFeedbackArtifact(input: {
  interviewId: string;
  candidateName: string;
  packet: InterviewPacket;
  transcript: string;
  hasResume: boolean;
  resumeText?: string;
}): Promise<FeedbackArtifact> {
  if (!config.geminiApiKey) {
    throw new Error("Gemini is not configured.");
  }

  const transcriptAvailable = hasTranscriptText(input.transcript);
  const parsed = FeedbackArtifactSchema.parse(await generateGeminiJson({
    prompt: buildFeedbackPrompt(input),
    schemaName: "feedback_artifact",
    schema: feedbackArtifactJsonSchema
  }));

  return {
    ...parsed,
    interviewId: input.interviewId,
    transcriptAvailable
  };
}

async function generateGeminiJson(options: {
  prompt: PromptMessage[];
  schemaName: string;
  schema: unknown;
}): Promise<unknown> {
  const primary = await sendGeminiRequest(options, true);
  if (primary.ok) {
    return parseGeminiJson(primary.bodyJson);
  }

  if (primary.status === 400) {
    const retry = await sendGeminiRequest(options, false);
    if (retry.ok) {
      return parseGeminiJson(retry.bodyJson);
    }

    throw new Error(formatGeminiError(retry));
  }

  throw new Error(formatGeminiError(primary));
}

async function sendGeminiRequest(options: {
  prompt: PromptMessage[];
  schemaName: string;
  schema: unknown;
}, includeJsonSchema: boolean): Promise<GeminiHttpResult> {
  const url = buildGeminiUrl();
  const { systemText, userText } = splitPrompt(options.prompt);
  const schemaInstruction = includeJsonSchema
    ? ""
    : [
      "",
      "",
      `Return valid JSON only. It must match this JSON Schema named ${options.schemaName}:`,
      JSON.stringify(options.schema, null, 2)
    ].join("\n");

  const body = {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents: [
      {
        role: "user",
        parts: [{ text: `${userText}${schemaInstruction}` }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      ...(includeJsonSchema ? { responseJsonSchema: options.schema } : {})
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const bodyText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    bodyJson: parseJsonBody(bodyText)
  };
}

function buildGeminiUrl(): URL {
  const baseUrl = config.geminiApiBaseUrl.replace(/\/$/, "");
  const model = config.geminiModel.replace(/^models\//, "");
  const url = new URL(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", config.geminiApiKey ?? "");
  return url;
}

function splitPrompt(prompt: PromptMessage[]): { systemText: string; userText: string } {
  return {
    systemText: prompt
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n"),
    userText: prompt
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n\n")
  };
}

function parseGeminiJson(response: unknown): unknown {
  if (!isRecord(response) || !Array.isArray(response.candidates)) {
    throw new Error("Gemini response did not contain candidates.");
  }

  const text = response.candidates
    .flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
        return [];
      }

      return candidate.content.parts;
    })
    .map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response did not contain structured JSON text.");
  }

  return parseJsonText(text);
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return undefined;
  }
}

function parseJsonText(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("Gemini response text was not valid JSON.");
  }
}

function formatGeminiError(result: GeminiHttpResult): string {
  const detail = result.bodyText.trim().slice(0, 700) || "No response body.";
  return `Gemini API error (${result.status}): ${detail}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
