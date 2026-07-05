import { compactText, MAX_JOB_DESCRIPTION_CHARS, MAX_RESUME_CHARS, type InterviewPacket } from "@kfl-interview/shared";

export type PromptMessage = {
  role: "system" | "user";
  content: string;
};

// Recipient: OpenAI or Gemini JSON generation. Timeline: interview creation, before the live avatar session starts.
export function buildInterviewPacketPrompt(input: {
  candidateName: string;
  jobDescriptionText: string;
  resumeText?: string;
}): PromptMessage[] {
  const resumeBlock = input.resumeText
    ? compactText(input.resumeText, MAX_RESUME_CHARS)
    : "No resume was supplied. Treat resume-specific guidance as unavailable.";

  return [
    {
      role: "system",
      content: [
        "You create realistic mock interview plans for a live avatar interviewer.",
        "Return only JSON matching the provided schema.",
        "Set interviewer.name to Lyra.",
        "Use only the submitted job description to identify the target employer. If the employer is not explicit, set role.company to \"the hiring company\". Do not infer Keyframe Labs as the employer unless the job description explicitly says so.",
        "The interview must begin with an interviewer introduction, explain that this is a mock interview followed by coaching, describe the company and role, ask about relevant field experience, ask exactly two aligned experience questions, ask one hard-skill example prompt, ask one soft-skill example prompt, then close and coach.",
        "For every main interview question, the live interviewer must listen to the candidate's answer, summarize what the candidate did in one short sentence, then ask exactly one clarifying follow-up tied to a requirement, responsibility, tool, stakeholder, metric, or outcome from the job description before moving to the next main question.",
        "The coaching sequence must include exactly one strength from the interview, then exactly two improvements.",
        "For each improvement, the interviewer must ask the candidate to provide a revised answer, stronger example, or clearer phrasing that applies that improvement before moving to the next improvement.",
        "After coaching, the interviewer must tell the candidate to generate the summary by clicking the Generate summary button below, then end the call.",
        "If the interviewee interrupts for clarification or importance, the interviewer should answer briefly and ask one follow-up that ties the clarification back to the job description.",
        "Create the interview rubric before the interview begins."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Candidate name: ${input.candidateName}`,
        "",
        "Job description:",
        compactText(input.jobDescriptionText, MAX_JOB_DESCRIPTION_CHARS),
        "",
        "Resume:",
        resumeBlock
      ].join("\n")
    }
  ];
}

// Recipient: ElevenLabs live interviewer system prompt. Timeline: session start, before the candidate joins the live call.
export function buildElevenLabsInterviewerPrompt(input: {
  candidateName: string;
  packet: InterviewPacket;
  jobDescriptionText: string;
  resumeText?: string;
}): string {
  const resumeInstruction = input.resumeText
    ? "Use the resume context to ask tailored follow-ups and later suggest role-aligned resume bullets."
    : "The candidate did not supply a resume. Keep coaching focused on the interview answers and role context.";
  const jobDescriptionExcerpt = compactText(input.jobDescriptionText, 4000);

  return [
    "You are Lyra, a realistic mock interviewer and interview coach shown through a live video interview experience.",
    "The submitted job description is the source of truth for the target employer, role, responsibilities, and interview topics.",
    "Keyframe Labs is only the avatar/video provider for this demo. Do not describe Keyframe Labs as the employer unless the submitted job description explicitly names Keyframe Labs.",
    "",
    "Submitted job description:",
    jobDescriptionExcerpt,
    "",
    "Derived interview context:",
    `You are interviewing ${input.candidateName} for ${input.packet.role.title}.`,
    `Derived target company: ${input.packet.role.company}.`,
    `Role brief: ${input.packet.interviewer.positionBrief}`,
    "If the first message already greeted the candidate, do not repeat that greeting. After they answer, say: \"My name is Lyra, and I will be conducting your mock interview.\"",
    "Briefly describe the company in one sentence and ask whether the candidate is familiar with it. After they answer, briefly describe the role and ask whether they have experience in similar roles.",
    "",
    "Follow this interview flow:",
    `1. Ask: ${input.packet.questionPlan.relevantExperienceQuestion}`,
    `2. Ask exactly these two aligned experience questions: ${input.packet.questionPlan.alignedExperienceQuestions.join(" | ")}`,
    `3. Ask for hard experience: ${input.packet.questionPlan.hardSkillPrompt}`,
    `4. Ask for soft experience: ${input.packet.questionPlan.softSkillPrompt}`,
    `5. Thank the candidate and move into coaching: ${input.packet.questionPlan.closingPrompt}`,
    "",
    "For each main interview question, use this conversational loop: ask the planned question, wait for the answer, summarize the candidate's specific action or result in one short sentence, then ask exactly one clarifying follow-up tied to the job description. Wait for that follow-up answer before moving on.",
    "If an answer is thin, summarize what you heard and ask for the missing STAR detail most relevant to the job description, such as scope, tools, stakeholders, tradeoffs, metrics, or impact.",
    "Avoid generic follow-ups. Make each follow-up feel like a real interviewer connecting the candidate's example to this role.",
    "",
    "During coaching, give exactly one specific strength from the interview, then exactly two specific improvements.",
    "For each improvement, ask the candidate to provide a revised answer, stronger example, or clearer phrasing that applies that improvement. Let them respond before moving to the next improvement.",
    "After the second improvement practice response, briefly acknowledge the work, tell the candidate to generate the summary by clicking the Generate summary button below, then use the end_call tool.",
    resumeInstruction,
    `If interrupted for clarification, answer concisely and ask this style of follow-up: ${input.packet.questionPlan.clarificationFollowUpPrompt}`,
    "Keep spoken turns natural and concise. Ask one question at a time. End every interview and coaching-practice turn with a question; the final Generate summary instruction is the only exception. Do not read the whole rubric aloud.",
    "",
    `Rubric: ${JSON.stringify(input.packet.rubric)}`,
    `Resume excerpt: ${input.resumeText ? compactText(input.resumeText, 3000) : "No resume supplied."}`
  ].join("\n");
}

// Recipient: ElevenLabs conversation dynamic variables. Timeline: session initiation, alongside the signed voice session details.
export function buildDynamicVariables(input: {
  candidateName: string;
  packet: InterviewPacket;
  jobDescriptionText: string;
  resumeText?: string;
}): Record<string, string> {
  return {
    candidate_name: input.candidateName,
    interviewer_name: "Lyra",
    position_title: input.packet.role.title,
    company_name: input.packet.role.company,
    position_summary: input.packet.role.summary,
    opening_script: `Hi ${input.candidateName}, it's nice to meet you. How are you doing?`,
    first_message: `Hi ${input.candidateName}, it's nice to meet you. How are you doing?`,
    position_brief: input.packet.interviewer.positionBrief,
    coaching_transition: input.packet.interviewer.coachingTransition,
    coaching_flow: "Give exactly one interview strength, then exactly two improvements. After each improvement, ask the candidate to provide a revised answer or stronger example that applies the improvement. After the second improvement practice response, tell the candidate to click the Generate summary button below and then end the call.",
    conversation_flow: "For each main interview question, ask the planned question, wait, summarize what the candidate did in one short sentence, then ask exactly one clarifying follow-up tied to the job description before moving on.",
    end_call_instruction: "End the call only after the coaching sequence is complete and after telling the candidate to click the Generate summary button below.",
    interview_rubric: JSON.stringify(input.packet.rubric),
    planned_questions: JSON.stringify(input.packet.questionPlan),
    resume_context: input.resumeText ? compactText(input.resumeText, 6000) : "No resume supplied.",
    job_description: compactText(input.jobDescriptionText, 8000),
    job_description_excerpt: compactText(input.jobDescriptionText, 1000)
  };
}

// Recipient: OpenAI or Gemini JSON generation. Timeline: interview end, after the transcript is fetched.
export function buildFeedbackPrompt(input: {
  interviewId: string;
  candidateName: string;
  packet: InterviewPacket;
  transcript: string;
  hasResume: boolean;
  resumeText?: string;
}): PromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are an interview coach generating a post-session artifact.",
        "Return only JSON matching the provided schema.",
        "Ground feedback in the rubric, transcript, job description context, and resume context if available.",
        "Include overallSummary, strengths, and gaps.",
        "For compatibility, return empty arrays for rubricScores, suggestedAnswerPatterns, and practiceTasks.",
        "If a resume was supplied, include 2 to 4 resumeSuggestions.",
        "Each resume suggestion must include a concise title, currentBullet, improvedBullet, and a brief rationale.",
        "currentBullet must be the exact resume bullet to replace when possible. If no exact bullet exists, describe where to add the new bullet.",
        "improvedBullet must be a complete copy-paste-ready resume bullet with a leading '- ' marker.",
        "Every improvedBullet must be 160 characters or fewer, including the leading '- ' marker.",
        "If no resume was supplied, return an empty resumeSuggestions array."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Interview ID: ${input.interviewId}`,
        `Candidate: ${input.candidateName}`,
        `Resume supplied: ${input.hasResume ? "yes" : "no"}`,
        "",
        "Interview packet:",
        JSON.stringify(input.packet),
        "",
        "Resume:",
        input.resumeText ? compactText(input.resumeText, MAX_RESUME_CHARS) : "No resume supplied.",
        "",
        "Transcript:",
        input.transcript || "Transcript was not available yet."
      ].join("\n")
    }
  ];
}
