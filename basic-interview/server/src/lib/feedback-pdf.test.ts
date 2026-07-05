import { describe, expect, it } from "vitest";

import type { FeedbackArtifact } from "@kfl-interview/shared";

import {
  createFeedbackPdfFilename,
  createFeedbackPdfPayload,
  FEEDBACK_ARTIFACT_TYPST_SOURCE,
  renderFeedbackArtifactPdf
} from "./feedback-pdf";

describe("feedback PDF Typst payload", () => {
  it("uses a fixed Typst template that reads the structured artifact JSON", () => {
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).toContain('json("artifact.json")');
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).toContain("Overall summary");
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).toContain("Tailor your resume to this role");
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).not.toContain("Next focus");
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).not.toContain("Rubric scores");
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).not.toContain("Answer patterns");
    expect(FEEDBACK_ARTIFACT_TYPST_SOURCE).not.toContain("Practice tasks");
  });

  it("keeps artifact content in JSON instead of interpolating it into Typst code", () => {
    const artifact = createArtifact({
      overallSummary: 'Candidate text with Typst-looking syntax #panic("boom") [close] $math$'
    });

    const payload = createFeedbackPdfPayload(artifact);
    const parsed = JSON.parse(payload.artifactJson) as FeedbackArtifact;

    expect(payload.typstSource).not.toContain("#panic");
    expect(payload.typstSource).not.toContain("Candidate text with Typst-looking syntax");
    expect(parsed.overallSummary).toBe(artifact.overallSummary);
  });

  it("creates a safe PDF filename from the interview id", () => {
    expect(createFeedbackPdfFilename(createArtifact({ interviewId: "demo/../../candidate #1" })))
      .toBe("interview-coaching-summary-demo-candidate-1.pdf");
  });

  it("reports a missing Typst executable as a service-level error", async () => {
    let caught: unknown;

    try {
      await renderFeedbackArtifactPdf(createArtifact(), {
        typstBin: "/definitely/missing/typst",
        timeoutMs: 500
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      status: 503,
      message: expect.stringContaining("Typst is required")
    });
  });
});

function createArtifact(overrides: Partial<FeedbackArtifact> = {}): FeedbackArtifact {
  return {
    interviewId: "demo",
    generatedAt: "2026-07-02T12:00:00.000Z",
    overallSummary: "The candidate should keep practicing concise, role-specific examples.",
    strengths: [
      {
        title: "Role framing",
        evidence: "The answer connected prior work to the target role.",
        whyItMatters: "That helps interviewers evaluate transferability."
      }
    ],
    gaps: [
      {
        title: "Metrics",
        evidence: "Some answers described work without measurable results.",
        improvement: "Add impact numbers or clear before-and-after outcomes."
      }
    ],
    rubricScores: [
      {
        criterionId: "role-fit",
        title: "Role fit",
        score: 3,
        evidence: "The answer was relevant but could be more concrete.",
        improvement: "Tie the example back to the job description."
      }
    ],
    suggestedAnswerPatterns: [
      {
        name: "STAR plus tie-back",
        pattern: "Situation, task, action, result, and one role-specific closing sentence.",
        exampleStarter: "A similar challenge I handled was..."
      }
    ],
    practiceTasks: [
      {
        title: "Two-minute role-fit answer",
        instructions: "Record a concise answer aligned to the job description.",
        targetOutcome: "Clearer evidence in less time."
      }
    ],
    resumeSuggestions: [
      {
        title: "Add impact",
        currentBullet: "Responsible for onboarding customers.",
        improvedBullet: "- Improved onboarding by building a checklist that reduced setup delays and clarified next steps for customers.",
        rationale: "Specific bullets are easier for recruiters to map to the role."
      }
    ],
    transcriptAvailable: true,
    ...overrides
  };
}
