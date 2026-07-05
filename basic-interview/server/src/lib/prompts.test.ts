import { describe, expect, it } from "vitest";

import type { InterviewPacket } from "@kfl-interview/shared";
import { buildElevenLabsInterviewerPrompt } from "./prompts";

describe("ElevenLabs interviewer prompt", () => {
  it("places the submitted Lab 37 job description before derived company framing", () => {
    const jobDescription = [
      "Company: Lab 37 Robotics",
      "Role: Robotics Operations Specialist",
      "Maintain autonomous warehouse robots and coordinate field repairs."
    ].join("\n");
    const prompt = buildElevenLabsInterviewerPrompt({
      candidateName: "Alex",
      packet: makeInterviewPacket(),
      jobDescriptionText: jobDescription
    });

    expect(prompt).toContain("Submitted job description:");
    expect(prompt).toContain("Company: Lab 37 Robotics");
    expect(prompt).toContain("Derived target company: Lab 37 Robotics");
    expect(prompt.indexOf("Submitted job description:")).toBeLessThan(
      prompt.indexOf("Derived target company: Lab 37 Robotics")
    );
    expect(prompt).toContain("Keyframe Labs is only the avatar/video provider");
  });
});

function makeInterviewPacket(): InterviewPacket {
  return {
    role: {
      title: "Robotics Operations Specialist",
      company: "Lab 37 Robotics",
      seniority: "Mid-level",
      location: "On-site",
      summary: "Maintain robotics operations and field repairs."
    },
    interviewer: {
      name: "Lyra",
      openingScript: "Hi Alex, it's nice to meet you. How are you doing?",
      positionBrief: "Lab 37 Robotics needs robotics operations support.",
      coachingTransition: "Let's move into coaching."
    },
    rubric: [
      makeCriterion("technical"),
      makeCriterion("communication"),
      makeCriterion("ownership"),
      makeCriterion("field-ops")
    ],
    questionPlan: {
      relevantExperienceQuestion: "What robotics operations experience do you have?",
      alignedExperienceQuestions: [
        "Tell me about a repair process you improved.",
        "Tell me about coordinating field support."
      ],
      hardSkillPrompt: "Describe a hardware troubleshooting example.",
      softSkillPrompt: "Describe a cross-functional communication example.",
      clarificationFollowUpPrompt: "How would that help Lab 37 Robotics?",
      closingPrompt: "Thanks, let's move into coaching."
    },
    candidateSignals: ["Robotics operations"],
    resumeGuidance: {
      hasResume: false,
      matchStrengths: [],
      improvementTargets: [],
      noResumeBulletThemes: ["Robotics troubleshooting impact"]
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
