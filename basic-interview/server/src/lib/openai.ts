import OpenAI from "openai";

import {
  FeedbackArtifactSchema,
  InterviewPacketSchema,
  type FeedbackArtifact,
  type InterviewPacket
} from "@kfl-interview/shared";

import { config } from "./config";
import { feedbackArtifactJsonSchema, interviewPacketJsonSchema } from "./openai-schemas";
import { buildFeedbackPrompt, buildInterviewPacketPrompt } from "./prompts";
import { hasTranscriptText } from "./transcripts";

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

export function isOpenAIConfigured(): boolean {
  return Boolean(client);
}

export async function createOpenAIInterviewPacket(input: {
  candidateName: string;
  jobDescriptionText: string;
  resumeText?: string;
}): Promise<InterviewPacket> {
  if (!client) {
    throw new Error("OpenAI is not configured.");
  }

  const response = await (client.responses.create as unknown as (body: unknown) => Promise<unknown>)({
    model: config.openaiModel,
    input: buildInterviewPacketPrompt(input),
    text: {
      format: {
        type: "json_schema",
        name: "interview_packet",
        strict: true,
        schema: interviewPacketJsonSchema
      }
    }
  });

  return InterviewPacketSchema.parse(parseStructuredResponse(response));
}

export async function createOpenAIFeedbackArtifact(input: {
  interviewId: string;
  candidateName: string;
  packet: InterviewPacket;
  transcript: string;
  hasResume: boolean;
  resumeText?: string;
}): Promise<FeedbackArtifact> {
  const transcriptAvailable = hasTranscriptText(input.transcript);

  if (!client) {
    throw new Error("OpenAI is not configured.");
  }

  const response = await (client.responses.create as unknown as (body: unknown) => Promise<unknown>)({
    model: config.openaiModel,
    input: buildFeedbackPrompt(input),
    text: {
      format: {
        type: "json_schema",
        name: "feedback_artifact",
        strict: true,
        schema: feedbackArtifactJsonSchema
      }
    }
  });

  const parsed = FeedbackArtifactSchema.parse(parseStructuredResponse(response));

  return {
    ...parsed,
    interviewId: input.interviewId,
    transcriptAvailable
  };
}

function parseStructuredResponse(response: unknown): unknown {
  if (isRecord(response) && typeof response.output_text === "string") {
    return JSON.parse(response.output_text);
  }

  if (isRecord(response) && Array.isArray(response.output)) {
    const text = response.output
      .flatMap((item) => isRecord(item) && Array.isArray(item.content) ? item.content : [])
      .map((content) => {
        if (!isRecord(content)) {
          return "";
        }

        if (typeof content.text === "string") {
          return content.text;
        }

        if (typeof content.output_text === "string") {
          return content.output_text;
        }

        return "";
      })
      .join("");

    if (text) {
      return JSON.parse(text);
    }
  }

  throw new Error("OpenAI response did not contain structured JSON output.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
