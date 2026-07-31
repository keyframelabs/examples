export const INTERVIEW_DURATION_MS = (9 * 60 + 59) * 1000;

export function createInterviewDeadline(
  connectedAt: number,
  durationMs = INTERVIEW_DURATION_MS
): number {
  return connectedAt + durationMs;
}

export function interviewTimeRemaining(
  deadline: number,
  now: number
): number {
  return Math.max(0, deadline - now);
}

export function formatInterviewTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}
