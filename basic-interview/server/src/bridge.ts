import "./lib/load-env";

import { randomUUID } from "node:crypto";

import {
  EndInterviewRequestSchema,
  InterviewCreateResponseSchema,
  LiveSessionResponseSchema,
  compactText,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_RESUME_CHARS,
  type FeedbackArtifact
} from "@kfl-interview/shared";

import { config } from "./lib/config";
import { extractTextFromUpload } from "./lib/documents";
import {
  buildElevenLabsPromptDebug,
  createElevenLabsVoiceAgentDetails,
  fetchTranscriptForRecord
} from "./lib/elevenlabs";
import { renderFeedbackArtifactPdf } from "./lib/feedback-pdf";
import { createKeyframeSession } from "./lib/keyframe";
import { createFeedbackArtifact, createInterviewPacket, getActiveLlmMode } from "./lib/llm";
import { buildElevenLabsInterviewerPrompt } from "./lib/prompts";
import type { InterviewRecord } from "./lib/store";

type BridgePayload = Record<string, unknown>;

async function main() {
  const command = process.argv[2] ?? "";
  const payload = await readPayload();
  const result = await handleCommand(command, payload);
  writeResult({ ok: true, result });
}

async function handleCommand(command: string, payload: BridgePayload): Promise<unknown> {
  if (command === "health") {
    return {
      ok: true,
      service: "kfl-interview-demo",
      mode: getActiveLlmMode()
    };
  }

  if (command === "create-interview") {
    return createInterview(payload);
  }

  if (command === "start-session") {
    return startSession(payload);
  }

  if (command === "end-interview") {
    return endInterview(payload);
  }

  if (command === "render-pdf") {
    return renderPdf(payload);
  }

  throw Object.assign(new Error(`Unknown bridge command: ${command}`), { status: 400 });
}

async function createInterview(payload: BridgePayload) {
  const uploadedResume = await extractTextFromUpload(toUploadLike(payload.resumeUpload));
  const jobDescriptionText = compactText(
    stringField(payload.jobDescriptionText),
    MAX_JOB_DESCRIPTION_CHARS
  );
  const resumeText = compactText(
    uploadedResume.trim(),
    MAX_RESUME_CHARS
  );
  const candidateName = stringField(payload.candidateName) || "there";

  if (!jobDescriptionText) {
    throw Object.assign(
      new Error("Add a job description before creating the interview."),
      { status: 400 }
    );
  }

  const { packet, mode } = await createInterviewPacket({
    candidateName,
    jobDescriptionText,
    resumeText: resumeText || undefined
  });

  const interviewId = randomUUID();
  const record: InterviewRecord = {
    id: interviewId,
    candidateName,
    jobDescriptionText,
    resumeText: resumeText || undefined,
    hasResume: Boolean(resumeText),
    packet,
    mode,
    createdAt: new Date().toISOString()
  };

  const response = InterviewCreateResponseSchema.parse({
    interviewId,
    hasResume: Boolean(resumeText),
    positionSummary: packet.role.summary,
    rubricPreview: packet.rubric,
    mode
  });

  return { record, response };
}

async function startSession(payload: BridgePayload) {
  const record = requiredRecord(payload.record);
  const interviewerPrompt = buildElevenLabsInterviewerPrompt({
    candidateName: record.candidateName,
    packet: record.packet,
    jobDescriptionText: record.jobDescriptionText,
    resumeText: record.resumeText
  });
  const firstMessage = record.packet.interviewer.openingScript;

  const [sessionDetails, agent] = await Promise.all([
    createKeyframeSession(),
    createElevenLabsVoiceAgentDetails(record, interviewerPrompt)
  ]);
  const sessionStartedAtUnix = Math.floor(Date.now() / 1000);

  const response = LiveSessionResponseSchema.parse({
    interviewId: record.id,
    sessionDetails,
    voiceAgentDetails: agent.voiceAgentDetails,
    sessionStartedAtUnix,
    interviewerPromptPreview: interviewerPrompt.slice(0, 900),
    elevenLabsPromptDebug: config.exposeElevenLabsPromptDebug
      ? buildElevenLabsPromptDebug({
        prompt: interviewerPrompt,
        firstMessage
      })
      : undefined
  });

  return {
    response,
    recordPatch: {
      sessionStartedAtUnix,
      conversationId: agent.conversationId
    }
  };
}

async function endInterview(payload: BridgePayload) {
  const record = requiredRecord(payload.record);
  const parsed = EndInterviewRequestSchema.parse({
    conversationId: typeof payload.conversationId === "string" ? payload.conversationId : undefined
  });
  const transcript = await fetchTranscriptForRecord(record, parsed.conversationId);
  const artifact = await createFeedbackArtifact({
    interviewId: record.id,
    candidateName: record.candidateName,
    packet: record.packet,
    transcript,
    hasResume: record.hasResume,
    resumeText: record.resumeText
  });

  return {
    feedbackArtifact: artifact,
    recordPatch: {
      feedbackArtifact: artifact,
      conversationId: parsed.conversationId ?? record.conversationId
    }
  };
}

async function renderPdf(payload: BridgePayload) {
  const artifact = payload.artifact as FeedbackArtifact;
  const { pdf, filename } = await renderFeedbackArtifactPdf(artifact);

  return {
    filename,
    pdfBase64: pdf.toString("base64")
  };
}

function requiredRecord(value: unknown): InterviewRecord {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw Object.assign(new Error("Interview not found. Start a new interview."), { status: 404 });
  }

  return value as InterviewRecord;
}

function toUploadLike(value: unknown) {
  if (!isRecord(value) || typeof value.contentBase64 !== "string" || typeof value.filename !== "string") {
    return undefined;
  }

  const buffer = Buffer.from(value.contentBase64, "base64");

  return {
    originalname: value.filename,
    mimetype: typeof value.contentType === "string" ? value.contentType : "application/octet-stream",
    buffer,
    size: typeof value.size === "number" ? value.size : buffer.byteLength
  };
}

function stringField(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return typeof value === "string" ? value.trim() : "";
}

async function readPayload(): Promise<BridgePayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

function writeResult(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status: unknown }).status)
    : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";

  writeResult({
    ok: false,
    error: message,
    status: Number.isFinite(status) ? status : 500
  });
  process.exitCode = 1;
});
