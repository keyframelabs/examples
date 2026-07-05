import type { FeedbackArtifact, InterviewPacket, RubricCriterion } from "@kfl-interview/shared";

function findJobTitle(jobDescription: string): string {
  const titlePatterns = [
    /job title[:\s]+([^\n]+)/i,
    /position[:\s]+([^\n]+)/i,
    /role[:\s]+([^\n]+)/i
  ];

  for (const pattern of titlePatterns) {
    const match = jobDescription.match(pattern);
    if (match?.[1]) {
      return cleanTitle(match[1]);
    }
  }

  const firstLine = jobDescription.split("\n").find((line) => line.trim().length > 8);
  return firstLine ? cleanTitle(firstLine) : "Target Role";
}

function cleanTitle(value: string): string {
  return value
    .split(".")[0]
    .replace(/[|,].*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+at\s+.*$/i, "")
    .trim()
    .slice(0, 80) || "Target Role";
}

function defaultLevels() {
  return [
    { score: 1, label: "Missing", description: "The answer does not show usable evidence." },
    { score: 3, label: "Developing", description: "The answer shows partial evidence but needs more detail and impact." },
    { score: 5, label: "Strong", description: "The answer is specific, relevant, measurable, and tied to the role." }
  ];
}

export function createLocalInterviewPacket(input: {
  jobDescriptionText: string;
  resumeText?: string;
  candidateName: string;
}): InterviewPacket {
  const title = findJobTitle(input.jobDescriptionText);
  const hasResume = Boolean(input.resumeText?.trim());
  const rubric: RubricCriterion[] = [
    {
      id: "role-fit",
      title: "Role fit",
      description: "Connects prior experience to the job's responsibilities and outcomes.",
      weight: 0.25,
      levels: defaultLevels()
    },
    {
      id: "technical-depth",
      title: "Hard skills",
      description: "Explains tools, systems, methods, or technical decisions with credible detail.",
      weight: 0.25,
      levels: defaultLevels()
    },
    {
      id: "collaboration",
      title: "Soft skills",
      description: "Demonstrates communication, teamwork, stakeholder awareness, and adaptability.",
      weight: 0.2,
      levels: defaultLevels()
    },
    {
      id: "answer-structure",
      title: "Answer structure",
      description: "Uses concise examples with situation, action, result, and reflection.",
      weight: 0.15,
      levels: defaultLevels()
    },
    {
      id: "resume-alignment",
      title: "Resume alignment",
      description: "Presents evidence that can be mirrored clearly in resume bullets.",
      weight: 0.15,
      levels: defaultLevels()
    }
  ];

  return {
    role: {
      title,
      company: "the hiring team",
      seniority: "not specified",
      location: "not specified",
      summary: `This mock interview is tailored to the supplied job description for ${title}.`
    },
    interviewer: {
      name: "Lyra",
      openingScript: `Hi ${input.candidateName}, it's nice to meet you. How are you doing?`,
      positionBrief: `The role appears to prioritize responsibilities and evidence described in the job description. I will ask about relevant field experience, matching examples, hard skills, and soft skills.`,
      coachingTransition: "Thanks for walking through those examples. I am going to shift into coaching with one strength, two improvements, and a quick practice prompt for each improvement."
    },
    rubric,
    questionPlan: {
      relevantExperienceQuestion: "What relevant experience do you have in this field, and which parts of this role feel closest to work you have already done?",
      alignedExperienceQuestions: [
        "Tell me about a project or responsibility from your background that maps closely to this job description.",
        "What achievement from your experience would best convince this hiring team that you can succeed in this role?"
      ],
      hardSkillPrompt: "Give me an example of a technical or hard-skill challenge you handled that relates to this role.",
      softSkillPrompt: "Give me an example of collaboration, communication, or prioritization that would matter in this role.",
      clarificationFollowUpPrompt: "How would that clarification change the example you choose for this specific job description?",
      closingPrompt: "Thank you. I will now share one strength, then two improvements. For each improvement, I will ask you to try a revised answer before we end."
    },
    candidateSignals: hasResume
      ? ["Resume supplied for role matching.", "Coach should compare resume claims with interview answers."]
      : ["No resume supplied. Coach should suggest resume bullet themes after the interview."],
    resumeGuidance: {
      hasResume,
      matchStrengths: hasResume ? ["Resume context is available for targeted matching."] : [],
      improvementTargets: hasResume
        ? ["Mirror the job description's most important outcomes in measurable bullets."]
        : [],
      noResumeBulletThemes: hasResume
        ? []
        : [
          "Add one measurable role-relevant accomplishment.",
          "Add one hard-skill example tied to the job description.",
          "Add one collaboration or stakeholder example."
        ]
    }
  };
}

export function createLocalFeedback(input: {
  interviewId: string;
  packet: InterviewPacket;
  hasResume: boolean;
  transcriptAvailable: boolean;
}): FeedbackArtifact {
  return {
    interviewId: input.interviewId,
    generatedAt: new Date().toISOString(),
    overallSummary: input.transcriptAvailable
      ? "The interview is ready for review. Use the transcript-backed notes to focus the next practice round."
      : "No transcript was available yet, so this artifact uses the planned interview context as coaching scaffolding.",
    strengths: [
      {
        title: "Role-specific framing",
        evidence: "The session was built from the supplied job description.",
        whyItMatters: "Interviewers listen for examples that sound tailored to their exact role."
      }
    ],
    gaps: [
      {
        title: "Evidence density",
        evidence: "Answers should include concrete metrics, tradeoffs, and outcomes whenever possible.",
        improvement: "Prepare two STAR stories with measurable results before the next session."
      }
    ],
    rubricScores: [],
    suggestedAnswerPatterns: [],
    practiceTasks: [],
    resumeSuggestions: input.hasResume
      ? [
        {
          title: "Align impact to the role",
          currentBullet: "Update the most relevant existing experience bullet for this role.",
          improvedBullet: "- Delivered role-relevant work using key tools and measurable outcomes that match the target job requirements.",
          rationale: "A specific impact bullet helps recruiters connect the resume to the role quickly."
        }
      ]
      : [],
    transcriptAvailable: input.transcriptAvailable
  };
}
