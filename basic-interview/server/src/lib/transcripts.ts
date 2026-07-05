const ASSISTANT_ROLES = new Set([
  "agent",
  "ai",
  "assistant",
  "bot",
  "interviewer",
  "system",
  "tool"
]);

const CANDIDATE_ROLES = new Set([
  "caller",
  "candidate",
  "client",
  "customer",
  "human",
  "interviewee",
  "participant",
  "person",
  "user"
]);

export function hasTranscriptText(transcript: string): boolean {
  return transcript.trim().length > 0;
}

export function formatTranscriptLine(role: string, text: string): string {
  return `${normalizeTranscriptRole(role)}: ${text}`;
}

function normalizeTranscriptRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (isCandidateRole(normalized)) {
    return "user";
  }

  if (ASSISTANT_ROLES.has(normalized)) {
    return "assistant";
  }

  return normalized || "speaker";
}

function isCandidateRole(role: string): boolean {
  return CANDIDATE_ROLES.has(role.trim().toLowerCase());
}
