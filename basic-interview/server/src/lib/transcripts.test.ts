import { describe, expect, it } from "vitest";

import { formatTranscriptLine, hasTranscriptText } from "./transcripts";

describe("transcript availability", () => {
  it("rejects empty transcript text", () => {
    expect(hasTranscriptText(" \n\t ")).toBe(false);
  });

  it("accepts assistant-only intro text when the provider returned it", () => {
    expect(hasTranscriptText([
      "assistant: Hi Alex, I will run a mock interview and then provide coaching.",
      "agent: Let's begin with the role context."
    ].join("\n"))).toBe(true);
  });

  it("accepts a user response", () => {
    expect(hasTranscriptText([
      "assistant: Tell me about your relevant experience.",
      "user: I led two implementations for enterprise customers and reduced launch risk with a reusable checklist."
    ].join("\n"))).toBe(true);
  });

  it("normalizes provider labels for LLM readability", () => {
    const transcript = [
      formatTranscriptLine("agent", "Welcome to the interview."),
      formatTranscriptLine("caller", "I managed support escalations and improved handoff quality for the team.")
    ].join("\n");

    expect(transcript).toContain("assistant: Welcome");
    expect(transcript).toContain("user: I managed");
    expect(hasTranscriptText(transcript)).toBe(true);
  });
});
