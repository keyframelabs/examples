import {
  FeedbackArtifactSchema,
  InterviewCreateResponseSchema,
  LiveSessionResponseSchema,
  type FeedbackArtifact,
  type InterviewCreateResponse,
  type LiveSessionResponse
} from "@kfl-interview/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export type CreateInterviewInput = {
  candidateName: string;
  jobDescriptionText: string;
  resumeFile?: File | null;
};

export async function createInterview(input: CreateInterviewInput): Promise<InterviewCreateResponse> {
  const formData = new FormData();
  formData.set("candidateName", input.candidateName);
  formData.set("jobDescriptionText", input.jobDescriptionText);

  if (input.resumeFile) {
    formData.set("resumeFile", input.resumeFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/interviews`, {
    method: "POST",
    body: formData
  });

  return InterviewCreateResponseSchema.parse(await parseResponse(response));
}

export async function startLiveSession(interviewId: string): Promise<LiveSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return LiveSessionResponseSchema.parse(await parseResponse(response));
}

export async function endInterview(interviewId: string, conversationId?: string): Promise<FeedbackArtifact> {
  const response = await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId })
  });

  const payload = await parseResponse(response);
  if (!isRecord(payload) || !("feedbackArtifact" in payload)) {
    throw new Error("Feedback response did not include feedbackArtifact.");
  }

  return FeedbackArtifactSchema.parse(payload.feedbackArtifact);
}

export function getFeedbackArtifactPdfUrl(interviewId: string): string {
  return `${API_BASE_URL}/api/interviews/${encodeURIComponent(interviewId)}/artifact.pdf`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
