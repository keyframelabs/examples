const MAX_CONTEXT_JOB_DESCRIPTION_CHARS = 900;

export function buildInitialContextUpdate(dynamicVariables: Record<string, string> | undefined): string {
  if (!dynamicVariables) {
    return "";
  }

  return [
    `Mock interview context is active for candidate ${dynamicVariables.candidate_name ?? "the candidate"}.`,
    `Submitted job description excerpt: ${jobDescriptionExcerpt(dynamicVariables)}.`,
    `Target role: ${dynamicVariables.position_title ?? "the supplied role"}.`,
    `Company: ${dynamicVariables.company_name ?? "the hiring company"}.`,
    `Position summary: ${dynamicVariables.position_summary ?? "Use the supplied job description."}`,
    `Opening script to follow if needed: ${dynamicVariables.opening_script ?? ""}`,
    `Conversational interview flow: ${dynamicVariables.conversation_flow ?? ""}`,
    `Coaching flow: ${dynamicVariables.coaching_flow ?? ""}`,
    "The submitted job description is the source of truth. Keyframe Labs is only the avatar/video provider, not the target employer unless the job description explicitly says so. Conduct the interview according to the supplied rubric and planned questions. For each main interview question, summarize the candidate's answer briefly and ask one clarifying follow-up tied to the job description. Keep turns concise and role-specific. After completing coaching, tell the candidate to click Generate summary below, then end the call."
  ].join(" ");
}

function jobDescriptionExcerpt(dynamicVariables: Record<string, string>): string {
  const text = dynamicVariables.job_description_excerpt ?? dynamicVariables.job_description;
  if (!text?.trim()) {
    return "Use the supplied job description.";
  }

  return compactSingleLine(text, MAX_CONTEXT_JOB_DESCRIPTION_CHARS);
}

function compactSingleLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }

  const clipped = compacted.slice(0, maxLength - 3);
  const wordBoundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordBoundary > 80 ? wordBoundary : clipped.length).trimEnd()}...`;
}
