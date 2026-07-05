import { describe, expect, it } from "vitest";

import { buildInitialContextUpdate } from "./interview-context";

describe("initial ElevenLabs context update", () => {
  it("reinforces the raw job description excerpt instead of only derived company fields", () => {
    const update = buildInitialContextUpdate({
      candidate_name: "Alex",
      position_title: "Robotics Operations Specialist",
      company_name: "Lab 37 Robotics",
      position_summary: "Maintain autonomous warehouse robots.",
      job_description_excerpt: "Company: Lab 37 Robotics. Maintain autonomous warehouse robots and coordinate field repairs.",
      opening_script: "Hi Alex, it's nice to meet you. How are you doing?",
      conversation_flow: "Ask planned questions with follow-ups.",
      coaching_flow: "Give one strength and two improvements."
    });

    expect(update).toContain("Submitted job description excerpt: Company: Lab 37 Robotics");
    expect(update).toContain("Company: Lab 37 Robotics");
    expect(update).toContain("Keyframe Labs is only the avatar/video provider");
    expect(update.indexOf("Submitted job description excerpt")).toBeLessThan(update.indexOf("Target role:"));
  });
});
