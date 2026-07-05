import type { FeedbackArtifact, InterviewPacket } from "@kfl-interview/shared";

import { config, type ConfiguredLlmProvider } from "./config";
import { createGeminiFeedbackArtifact, createGeminiInterviewPacket, isGeminiConfigured } from "./gemini";
import { normalizeInterviewPacketForJobDescription } from "./job-context";
import { createLocalFeedback, createLocalInterviewPacket } from "./local-analysis";
import { createOpenAIFeedbackArtifact, createOpenAIInterviewPacket, isOpenAIConfigured } from "./openai";
import { hasTranscriptText } from "./transcripts";

export type LlmMode = "openai" | "gemini" | "local-fallback";

const MAX_RESUME_BULLET_CHARS = 160;

export function getActiveLlmMode(): LlmMode {
  return resolveLlmMode({
    provider: config.llmProvider,
    hasOpenAiKey: isOpenAIConfigured(),
    hasGeminiKey: isGeminiConfigured()
  });
}

export function resolveLlmMode(input: {
  provider: ConfiguredLlmProvider;
  hasOpenAiKey: boolean;
  hasGeminiKey: boolean;
}): LlmMode {
  if (input.provider === "local-fallback") {
    return "local-fallback";
  }

  if (input.provider === "gemini") {
    return input.hasGeminiKey ? "gemini" : "local-fallback";
  }

  return input.hasOpenAiKey ? "openai" : "local-fallback";
}

export async function createInterviewPacket(input: {
  candidateName: string;
  jobDescriptionText: string;
  resumeText?: string;
}): Promise<{ packet: InterviewPacket; mode: LlmMode }> {
  const mode = getActiveLlmMode();
  let packet: InterviewPacket;

  if (mode === "gemini") {
    packet = await createGeminiInterviewPacket(input);
  } else if (mode === "openai") {
    packet = await createOpenAIInterviewPacket(input);
  } else {
    packet = createLocalInterviewPacket(input);
  }

  return {
    packet: normalizeInterviewPacketForJobDescription(packet, input.jobDescriptionText),
    mode
  };
}

export async function createFeedbackArtifact(input: {
  interviewId: string;
  candidateName: string;
  packet: InterviewPacket;
  transcript: string;
  hasResume: boolean;
  resumeText?: string;
}): Promise<FeedbackArtifact> {
  const mode = getActiveLlmMode();
  const transcriptAvailable = hasTranscriptText(input.transcript);
  let artifact: FeedbackArtifact;

  if (!transcriptAvailable) {
    return normalizeFeedbackArtifact(createLocalFeedback({
      interviewId: input.interviewId,
      packet: input.packet,
      hasResume: input.hasResume,
      transcriptAvailable
    }), input.hasResume);
  }

  if (mode === "gemini") {
    artifact = await createGeminiFeedbackArtifact(input);
  } else if (mode === "openai") {
    artifact = await createOpenAIFeedbackArtifact(input);
  } else {
    artifact = createLocalFeedback({
      interviewId: input.interviewId,
      packet: input.packet,
      hasResume: input.hasResume,
      transcriptAvailable
    });
  }

  return normalizeFeedbackArtifact(artifact, input.hasResume);
}

function normalizeFeedbackArtifact(artifact: FeedbackArtifact, hasResume: boolean): FeedbackArtifact {
  if (!artifact.transcriptAvailable) {
    return {
      ...artifact,
      overallSummary: "No transcript was available for this call, so a coaching summary cannot be generated yet.",
      strengths: [],
      gaps: [],
      rubricScores: [],
      suggestedAnswerPatterns: [],
      practiceTasks: [],
      resumeSuggestions: []
    };
  }

  const resumeSuggestions = hasResume
    ? artifact.resumeSuggestions.slice(0, 4).map((suggestion) => ({
      ...suggestion,
      currentBullet: normalizeCurrentBullet(suggestion.currentBullet),
      improvedBullet: normalizeResumeBullet(suggestion.improvedBullet)
    }))
    : [];

  return {
    ...artifact,
    rubricScores: [],
    suggestedAnswerPatterns: [],
    practiceTasks: [],
    resumeSuggestions: hasResume && resumeSuggestions.length === 0
      ? [createFallbackResumeSuggestion()]
      : resumeSuggestions
  };
}

function createFallbackResumeSuggestion(): FeedbackArtifact["resumeSuggestions"][number] {
  return {
    title: "Add measurable impact",
    currentBullet: "Add this under the most relevant role or project on the resume.",
    improvedBullet: "- Highlight a role-relevant accomplishment with the action, tool or method, metric, and business result.",
    rationale: "A measured outcome makes the resume easier to match to the job description."
  };
}

function normalizeCurrentBullet(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "Update the most relevant existing resume bullet.";
}

function normalizeResumeBullet(value: string): string {
  const text = value
    .replace(/^\s*[-*\u2022]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const bullet = `- ${text || "Add a measurable accomplishment aligned to the target role."}`;

  if (bullet.length <= MAX_RESUME_BULLET_CHARS) {
    return bullet;
  }

  const hardLimit = MAX_RESUME_BULLET_CHARS - 3;
  const clipped = bullet.slice(0, hardLimit);
  const wordBoundary = clipped.lastIndexOf(" ");
  const base = clipped
    .slice(0, wordBoundary > 20 ? wordBoundary : hardLimit)
    .replace(/[,.:-]+$/, "")
    .trimEnd();

  return `${base}...`;
}
