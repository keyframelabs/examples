export const INTERVIEW_DURATION_MS = (9 * 60 + 59) * 1000;

export type InterviewTimerState = {
  deadline: number | null;
  remainingMs: number;
  hasExpired: boolean;
};

export function createInterviewTimerState(
  durationMs = INTERVIEW_DURATION_MS
): InterviewTimerState {
  return {
    deadline: null,
    remainingMs: durationMs,
    hasExpired: false
  };
}

export function startInterviewTimer(
  connectedAt: number,
  durationMs = INTERVIEW_DURATION_MS
): InterviewTimerState {
  return {
    deadline: createInterviewDeadline(connectedAt, durationMs),
    remainingMs: durationMs,
    hasExpired: false
  };
}

export function tickInterviewTimer(
  timer: InterviewTimerState,
  now: number
): InterviewTimerState {
  if (timer.deadline === null || timer.hasExpired) return timer;

  const remainingMs = interviewTimeRemaining(timer.deadline, now);
  return {
    ...timer,
    remainingMs,
    hasExpired: remainingMs === 0
  };
}

export function stopInterviewTimer(
  timer: InterviewTimerState,
  stoppedAt: number
): InterviewTimerState {
  const stoppedTimer = tickInterviewTimer(timer, stoppedAt);
  if (stoppedTimer.deadline === null) return stoppedTimer;

  return {
    ...stoppedTimer,
    deadline: null
  };
}

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
