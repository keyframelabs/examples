import { z } from "zod";

export const UploadedTextSchema = z.object({
  jobDescriptionText: z.string().min(1),
  resumeText: z.string().optional(),
  candidateName: z.string().optional()
});

export const RubricLevelSchema = z.object({
  score: z.number().int().min(1).max(5),
  label: z.string().min(1),
  description: z.string().min(1)
});

export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0).max(1),
  levels: z.array(RubricLevelSchema).min(3).max(5)
});

export const InterviewPacketSchema = z.object({
  role: z.object({
    title: z.string().min(1),
    company: z.string().min(1),
    seniority: z.string().min(1),
    location: z.string().min(1),
    summary: z.string().min(1)
  }),
  interviewer: z.object({
    name: z.string().min(1),
    openingScript: z.string().min(1),
    positionBrief: z.string().min(1),
    coachingTransition: z.string().min(1)
  }),
  rubric: z.array(RubricCriterionSchema).min(4).max(8),
  questionPlan: z.object({
    relevantExperienceQuestion: z.string().min(1),
    alignedExperienceQuestions: z.array(z.string().min(1)).length(2),
    hardSkillPrompt: z.string().min(1),
    softSkillPrompt: z.string().min(1),
    clarificationFollowUpPrompt: z.string().min(1),
    closingPrompt: z.string().min(1)
  }),
  candidateSignals: z.array(z.string()).min(1),
  resumeGuidance: z.object({
    hasResume: z.boolean(),
    matchStrengths: z.array(z.string()),
    improvementTargets: z.array(z.string()),
    noResumeBulletThemes: z.array(z.string())
  })
});

export const InterviewCreateResponseSchema = z.object({
  interviewId: z.string().min(1),
  hasResume: z.boolean(),
  positionSummary: z.string().min(1),
  rubricPreview: z.array(RubricCriterionSchema),
  mode: z.enum(["openai", "gemini", "local-fallback"])
});

export const KeyframeSessionDetailsSchema = z.object({
  server_url: z.string().min(1),
  participant_token: z.string().min(1),
  agent_identity: z.string().min(1)
});

export const VoiceAgentDetailsSchema = z.object({
  type: z.literal("elevenlabs"),
  agent_id: z.string().optional(),
  signed_url: z.string().min(1),
  dynamic_variables: z.record(z.string(), z.string()).optional(),
  dynamicVariables: z.record(z.string(), z.string()).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  conversation_config_override: z.record(z.string(), z.unknown()).optional()
});

export const ElevenLabsPromptDebugSchema = z.object({
  firstMessage: z.string().min(1),
  systemPrompt: z.string().min(1),
  agentUpdatePayload: z.object({
    conversation_config: z.object({
      agent: z.object({
        first_message: z.string().min(1),
        disable_first_message_interruptions: z.literal(true),
        prompt: z.object({
          prompt: z.string().min(1)
        })
      })
    })
  })
});

export const LiveSessionResponseSchema = z.object({
  interviewId: z.string().min(1),
  sessionDetails: KeyframeSessionDetailsSchema,
  voiceAgentDetails: VoiceAgentDetailsSchema,
  sessionStartedAtUnix: z.number().int().positive(),
  interviewerPromptPreview: z.string().min(1),
  elevenLabsPromptDebug: ElevenLabsPromptDebugSchema.optional()
});

export const FeedbackArtifactSchema = z.object({
  interviewId: z.string().min(1),
  generatedAt: z.string().min(1),
  overallSummary: z.string().min(1),
  strengths: z.array(z.object({
    title: z.string().min(1),
    evidence: z.string().min(1),
    whyItMatters: z.string().min(1)
  })),
  gaps: z.array(z.object({
    title: z.string().min(1),
    evidence: z.string().min(1),
    improvement: z.string().min(1)
  })),
  rubricScores: z.array(z.object({
    criterionId: z.string().min(1),
    title: z.string().min(1),
    score: z.number().int().min(1).max(5),
    evidence: z.string().min(1),
    improvement: z.string().min(1)
  })),
  suggestedAnswerPatterns: z.array(z.object({
    name: z.string().min(1),
    pattern: z.string().min(1),
    exampleStarter: z.string().min(1)
  })),
  practiceTasks: z.array(z.object({
    title: z.string().min(1),
    instructions: z.string().min(1),
    targetOutcome: z.string().min(1)
  })),
  resumeSuggestions: z.array(z.object({
    title: z.string().min(1),
    currentBullet: z.string().min(1),
    improvedBullet: z.string().min(1),
    rationale: z.string().min(1)
  })),
  transcriptAvailable: z.boolean()
});

export const EndInterviewRequestSchema = z.object({
  conversationId: z.string().optional()
});

export type UploadedText = z.infer<typeof UploadedTextSchema>;
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;
export type InterviewPacket = z.infer<typeof InterviewPacketSchema>;
export type InterviewCreateResponse = z.infer<typeof InterviewCreateResponseSchema>;
export type KeyframeSessionDetails = z.infer<typeof KeyframeSessionDetailsSchema>;
export type VoiceAgentDetails = z.infer<typeof VoiceAgentDetailsSchema>;
export type ElevenLabsPromptDebug = z.infer<typeof ElevenLabsPromptDebugSchema>;
export type LiveSessionResponse = z.infer<typeof LiveSessionResponseSchema>;
export type FeedbackArtifact = z.infer<typeof FeedbackArtifactSchema>;
