import { describe, expect, it } from "vitest";

import { createInterviewStore } from "./interview-store";
import type { CreateInterviewInput } from "./api";
import type { FeedbackArtifact, InterviewCreateResponse } from "@kfl-interview/shared";

describe("interview flow store", () => {
  it("moves through setup, interview, feedback, and restart states", () => {
    const store = createInterviewStore();
    const input: CreateInterviewInput = {
      candidateName: "Alex",
      jobDescriptionText: "Role: Customer Success Engineer",
      resumeFile: null
    };
    const interview = createInterviewResponse();
    const artifact = createArtifact();

    expect(store.getState().flow.step).toBe("setup");

    store.getState().showInterview(input, interview);
    expect(store.getState().flow).toMatchObject({
      step: "interview",
      input,
      interview
    });

    store.getState().showFeedback(artifact);
    expect(store.getState().flow).toMatchObject({
      step: "feedback",
      artifact
    });

    store.getState().backToInterview();
    expect(store.getState().flow.step).toBe("interview");

    store.getState().restart();
    expect(store.getState().flow.step).toBe("setup");
  });
});

function createInterviewResponse(): InterviewCreateResponse {
  return {
    interviewId: "interview-123",
    hasResume: false,
    positionSummary: "Mock interview for the supplied role.",
    rubricPreview: [
      makeCriterion("role-fit"),
      makeCriterion("technical"),
      makeCriterion("collaboration"),
      makeCriterion("structure")
    ],
    mode: "local-fallback"
  };
}

function createArtifact(): FeedbackArtifact {
  return {
    interviewId: "interview-123",
    generatedAt: "2026-07-03T12:00:00.000Z",
    overallSummary: "Practice concise examples.",
    strengths: [],
    gaps: [],
    rubricScores: [],
    suggestedAnswerPatterns: [],
    practiceTasks: [],
    resumeSuggestions: [],
    transcriptAvailable: false
  };
}

function makeCriterion(id: string) {
  return {
    id,
    title: id,
    description: `${id} evidence`,
    weight: 0.25,
    levels: [
      { score: 1, label: "Low", description: "Limited evidence" },
      { score: 3, label: "Medium", description: "Some evidence" },
      { score: 5, label: "High", description: "Strong evidence" }
    ]
  };
}
