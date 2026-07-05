import { describe, expect, it } from "vitest";

import { createLocalFeedback, createLocalInterviewPacket } from "./local-analysis";

describe("local fallback interview analysis", () => {
  it("creates a rubric and no-resume bullet themes", () => {
    const packet = createLocalInterviewPacket({
      candidateName: "Sam",
      jobDescriptionText: "Job Title: Customer Success Engineer\nOwn implementation and technical discovery."
    });

    expect(packet.role.title).toBe("Customer Success Engineer");
    expect(packet.rubric.length).toBeGreaterThanOrEqual(4);
    expect(packet.resumeGuidance.hasResume).toBe(false);
    expect(packet.resumeGuidance.noResumeBulletThemes.length).toBeGreaterThan(0);
  });

  it("creates feedback without removed summary sections when no transcript is available", () => {
    const packet = createLocalInterviewPacket({
      candidateName: "Sam",
      jobDescriptionText: "Position: Support Lead\nCoach teams and report metrics."
    });

    const feedback = createLocalFeedback({
      interviewId: "demo",
      packet,
      hasResume: false,
      transcriptAvailable: false
    });

    expect(feedback.transcriptAvailable).toBe(false);
    expect(feedback.resumeSuggestions).toHaveLength(0);
    expect(feedback.rubricScores).toHaveLength(0);
    expect(feedback.suggestedAnswerPatterns).toHaveLength(0);
    expect(feedback.practiceTasks).toHaveLength(0);
  });
});
