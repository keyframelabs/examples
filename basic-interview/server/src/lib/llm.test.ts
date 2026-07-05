import { describe, expect, it } from "vitest";

import { resolveLlmMode } from "./llm";

describe("LLM provider resolution", () => {
  it("uses OpenAI when selected and configured", () => {
    expect(resolveLlmMode({
      provider: "openai",
      hasOpenAiKey: true,
      hasGeminiKey: false
    })).toBe("openai");
  });

  it("uses Gemini when selected and configured", () => {
    expect(resolveLlmMode({
      provider: "gemini",
      hasOpenAiKey: true,
      hasGeminiKey: true
    })).toBe("gemini");
  });

  it("falls back locally when the selected provider is missing its key", () => {
    expect(resolveLlmMode({
      provider: "gemini",
      hasOpenAiKey: true,
      hasGeminiKey: false
    })).toBe("local-fallback");
  });
});
