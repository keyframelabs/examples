import { afterEach, describe, expect, it, vi } from "vitest";

import type { InterviewPacket } from "@kfl-interview/shared";
import type { InterviewRecord } from "./store";

const ORIGINAL_ENV = { ...process.env };

describe("ElevenLabs agent configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("builds the agent update payload with the system prompt and non-interruptible intro", async () => {
    const { buildElevenLabsAgentUpdatePayload } = await import("./elevenlabs");

    expect(buildElevenLabsAgentUpdatePayload({
      prompt: "Interview system prompt",
      firstMessage: "Hi Alex, welcome to your mock interview."
    })).toEqual({
      conversation_config: {
        agent: {
          first_message: "Hi Alex, welcome to your mock interview.",
          disable_first_message_interruptions: true,
          prompt: {
            prompt: "Interview system prompt"
          }
        }
      }
    });
  });

  it("builds local prompt debug details from the same agent update payload", async () => {
    const { buildElevenLabsPromptDebug } = await import("./elevenlabs");

    expect(buildElevenLabsPromptDebug({
      prompt: "Interview system prompt",
      firstMessage: "Hi Alex, welcome to your mock interview."
    })).toEqual({
      firstMessage: "Hi Alex, welcome to your mock interview.",
      systemPrompt: "Interview system prompt",
      agentUpdatePayload: {
        conversation_config: {
          agent: {
            first_message: "Hi Alex, welcome to your mock interview.",
            disable_first_message_interruptions: true,
            prompt: {
              prompt: "Interview system prompt"
            }
          }
        }
      }
    });
  });

  it("updates the saved ElevenLabs agent before requesting a signed URL", async () => {
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    process.env.ELEVENLABS_AGENT_ID = "agent_test123";
    process.env.ELEVENLABS_API_BASE_URL = "https://api.test.elevenlabs";

    const calls: Array<{
      url: string;
      init?: RequestInit;
    }> = [];

    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = requestUrl(input);
      calls.push({ url, init });

      if (init?.method === "PATCH") {
        return jsonResponse({ agent_id: "agent_test123" });
      }

      if (url.includes("/v1/convai/conversation/get-signed-url")) {
        return jsonResponse({
          signed_url: "wss://signed-url.example",
          conversation_id: "conversation_123"
        });
      }

      return jsonResponse({ detail: "Unexpected request" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createElevenLabsVoiceAgentDetails } = await import("./elevenlabs");
    const result = await createElevenLabsVoiceAgentDetails(makeInterviewRecord(), "Generated system prompt");

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://api.test.elevenlabs/v1/convai/agents/agent_test123");
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(calls[0]?.init?.headers).toEqual({
      "Content-Type": "application/json",
      "xi-api-key": "test-elevenlabs-key"
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      conversation_config: {
        agent: {
          first_message: "Hi Alex, it's nice to meet you. How are you doing?",
          disable_first_message_interruptions: true,
          prompt: {
            prompt: "Generated system prompt"
          }
        }
      }
    });

    expect(calls[1]?.url).toBe(
      "https://api.test.elevenlabs/v1/convai/conversation/get-signed-url?agent_id=agent_test123&include_conversation_id=true"
    );
    expect(result.conversationId).toBe("conversation_123");
    expect(result.voiceAgentDetails).toMatchObject({
      type: "elevenlabs",
      agent_id: "agent_test123",
      signed_url: "wss://signed-url.example"
    });
    expect("conversation_config_override" in result.voiceAgentDetails).toBe(false);
    expect("overrides" in result.voiceAgentDetails).toBe(false);
  });
});

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function makeInterviewRecord(): InterviewRecord {
  return {
    id: "interview_123",
    candidateName: "Alex",
    jobDescriptionText: "Customer Success Engineer role",
    resumeText: "Led implementations",
    hasResume: true,
    packet: makeInterviewPacket(),
    mode: "local-fallback",
    createdAt: "2026-07-02T00:00:00.000Z"
  };
}

function makeInterviewPacket(): InterviewPacket {
  return {
    role: {
      title: "Customer Success Engineer",
      company: "Acme",
      seniority: "Mid-level",
      location: "Remote",
      summary: "Own implementation and technical discovery."
    },
    interviewer: {
      name: "Lyra",
      openingScript: "Hi Alex, it's nice to meet you. How are you doing?",
      positionBrief: "You will guide customers through technical onboarding.",
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
        "Tell me about an implementation you led.",
        "Tell me about managing a difficult stakeholder."
      ],
      hardSkillPrompt: "Describe a technical troubleshooting example.",
      softSkillPrompt: "Describe a cross-functional collaboration example.",
      clarificationFollowUpPrompt: "How would that apply to this role?",
      closingPrompt: "Thanks, let's move into coaching."
    },
    candidateSignals: ["implementation ownership"],
    resumeGuidance: {
      hasResume: true,
      matchStrengths: ["Customer onboarding"],
      improvementTargets: ["Metrics"],
      noResumeBulletThemes: []
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
