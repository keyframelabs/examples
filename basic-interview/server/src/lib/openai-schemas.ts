export const interviewPacketJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["role", "interviewer", "rubric", "questionPlan", "candidateSignals", "resumeGuidance"],
  properties: {
    role: {
      type: "object",
      additionalProperties: false,
      required: ["title", "company", "seniority", "location", "summary"],
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        seniority: { type: "string" },
        location: { type: "string" },
        summary: { type: "string" }
      }
    },
    interviewer: {
      type: "object",
      additionalProperties: false,
      required: ["name", "openingScript", "positionBrief", "coachingTransition"],
      properties: {
        name: { type: "string" },
        openingScript: { type: "string" },
        positionBrief: { type: "string" },
        coachingTransition: { type: "string" }
      }
    },
    rubric: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { $ref: "#/$defs/rubricCriterion" }
    },
    questionPlan: {
      type: "object",
      additionalProperties: false,
      required: [
        "relevantExperienceQuestion",
        "alignedExperienceQuestions",
        "hardSkillPrompt",
        "softSkillPrompt",
        "clarificationFollowUpPrompt",
        "closingPrompt"
      ],
      properties: {
        relevantExperienceQuestion: { type: "string" },
        alignedExperienceQuestions: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: { type: "string" }
        },
        hardSkillPrompt: { type: "string" },
        softSkillPrompt: { type: "string" },
        clarificationFollowUpPrompt: { type: "string" },
        closingPrompt: { type: "string" }
      }
    },
    candidateSignals: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    resumeGuidance: {
      type: "object",
      additionalProperties: false,
      required: ["hasResume", "matchStrengths", "improvementTargets", "noResumeBulletThemes"],
      properties: {
        hasResume: { type: "boolean" },
        matchStrengths: { type: "array", items: { type: "string" } },
        improvementTargets: { type: "array", items: { type: "string" } },
        noResumeBulletThemes: { type: "array", items: { type: "string" } }
      }
    }
  },
  $defs: {
    rubricCriterion: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "description", "weight", "levels"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        weight: { type: "number" },
        levels: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["score", "label", "description"],
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              label: { type: "string" },
              description: { type: "string" }
            }
          }
        }
      }
    }
  }
} as const;

export const feedbackArtifactJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "interviewId",
    "generatedAt",
    "overallSummary",
    "strengths",
    "gaps",
    "rubricScores",
    "suggestedAnswerPatterns",
    "practiceTasks",
    "resumeSuggestions",
    "transcriptAvailable"
  ],
  properties: {
    interviewId: { type: "string" },
    generatedAt: { type: "string" },
    overallSummary: { type: "string" },
    strengths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence", "whyItMatters"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
          whyItMatters: { type: "string" }
        }
      }
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence", "improvement"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
          improvement: { type: "string" }
        }
      }
    },
    rubricScores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterionId", "title", "score", "evidence", "improvement"],
        properties: {
          criterionId: { type: "string" },
          title: { type: "string" },
          score: { type: "integer", minimum: 1, maximum: 5 },
          evidence: { type: "string" },
          improvement: { type: "string" }
        }
      }
    },
    suggestedAnswerPatterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "pattern", "exampleStarter"],
        properties: {
          name: { type: "string" },
          pattern: { type: "string" },
          exampleStarter: { type: "string" }
        }
      }
    },
    practiceTasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "instructions", "targetOutcome"],
        properties: {
          title: { type: "string" },
          instructions: { type: "string" },
          targetOutcome: { type: "string" }
        }
      }
    },
    resumeSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "currentBullet", "improvedBullet", "rationale"],
        properties: {
          title: { type: "string" },
          currentBullet: { type: "string" },
          improvedBullet: { type: "string" },
          rationale: { type: "string" }
        }
      }
    },
    transcriptAvailable: { type: "boolean" }
  }
} as const;
