import { describe, expect, it } from "vitest";

import type { InterviewPacket } from "@kfl-interview/shared";
import { extractJobContext, normalizeInterviewPacketForJobDescription } from "./job-context";

describe("job context normalization", () => {
  it("extracts explicit Lab 37 Robotics context from the job description", () => {
    const jobDescription = [
      "Company: Lab 37 Robotics",
      "Job Title: Robotics Field Engineer",
      "Lab 37 Robotics builds autonomous inspection systems for industrial sites."
    ].join("\n");

    expect(extractJobContext(jobDescription)).toEqual({
      company: "Lab 37 Robotics",
      title: "Robotics Field Engineer"
    });
  });

  it("uses the submitted job description instead of a generated Keyframe Labs employer", () => {
    const normalized = normalizeInterviewPacketForJobDescription(
      makeInterviewPacket({
        company: "Keyframe Labs",
        title: "Keyframe Labs Robotics Specialist",
        summary: "This is a Keyframe Labs position working on robotics interviews.",
        positionBrief: "The Keyframe Labs role focuses on avatar tooling."
      }),
      [
        "Company: Lab 37 Robotics",
        "Role: Robotics Operations Specialist",
        "Lab 37 Robotics is hiring for field robotics operations, fleet support, and hardware troubleshooting."
      ].join("\n")
    );

    expect(normalized.role.company).toBe("Lab 37 Robotics");
    expect(normalized.role.title).toBe("Robotics Operations Specialist");
    expect(normalized.role.summary).toContain("Lab 37 Robotics position");
    expect(normalized.interviewer.positionBrief).toContain("Lab 37 Robotics role");
    expect(JSON.stringify(normalized)).not.toMatch(/Keyframe Labs|KeyframeLabs/i);
  });

  it("falls back to a generic hiring company when no explicit employer is present", () => {
    const normalized = normalizeInterviewPacketForJobDescription(
      makeInterviewPacket({
        company: "Imagined Co",
        summary: "Imagined Co needs a support engineer.",
        positionBrief: "Imagined Co owns customer escalation work."
      }),
      "Role: Support Engineer\nOwn customer escalations and improve technical handoffs."
    );

    expect(normalized.role.company).toBe("the hiring company");
    expect(JSON.stringify(normalized)).not.toContain("Imagined Co");
  });
});

function makeInterviewPacket(overrides: {
  company?: string;
  title?: string;
  summary?: string;
  positionBrief?: string;
} = {}): InterviewPacket {
  return {
    role: {
      title: overrides.title ?? "Robotics Specialist",
      company: overrides.company ?? "the hiring company",
      seniority: "Mid-level",
      location: "Remote",
      summary: overrides.summary ?? "This role is tailored to the supplied job description."
    },
    interviewer: {
      name: "Lyra",
      openingScript: "Hi Alex, it's nice to meet you. How are you doing?",
      positionBrief: overrides.positionBrief ?? "We will discuss the supplied job description.",
      coachingTransition: "Let's move into coaching."
    },
    rubric: [
      makeCriterion("technical"),
      makeCriterion("communication"),
      makeCriterion("ownership"),
      makeCriterion("customer")
    ],
    questionPlan: {
      relevantExperienceQuestion: "What relevant experience do you have?",
      alignedExperienceQuestions: [
        "Tell me about a role-aligned project.",
        "Tell me about a stakeholder challenge."
      ],
      hardSkillPrompt: "Describe a technical challenge.",
      softSkillPrompt: "Describe a collaboration example.",
      clarificationFollowUpPrompt: "How does that apply to this job description?",
      closingPrompt: "Thanks, let's move into coaching."
    },
    candidateSignals: ["Role-relevant experience"],
    resumeGuidance: {
      hasResume: false,
      matchStrengths: [],
      improvementTargets: [],
      noResumeBulletThemes: ["Add measurable role-relevant impact."]
    }
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
