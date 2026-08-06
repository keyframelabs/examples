import { describe, expect, it } from "vitest";

import {
  createInterviewDeadline,
  createInterviewTimerState,
  formatInterviewTime,
  INTERVIEW_DURATION_MS,
  interviewTimeRemaining,
  startInterviewTimer,
  stopInterviewTimer,
  tickInterviewTimer
} from "@/utils/interview/interviewTimer";

describe("interview timer", () => {
  it("creates an absolute nine-minute-fifty-nine-second deadline", () => {
    expect(createInterviewDeadline(1_000)).toBe(
      1_000 + INTERVIEW_DURATION_MS
    );
  });

  it("derives remaining time from the deadline and clamps at zero", () => {
    const deadline = createInterviewDeadline(1_000);

    expect(interviewTimeRemaining(deadline, 1_000)).toBe(
      INTERVIEW_DURATION_MS
    );
    expect(interviewTimeRemaining(deadline, deadline + 1)).toBe(0);
  });

  it("starts a fresh timer when Lyra is restarted after expiration", () => {
    const firstCall = startInterviewTimer(1_000);
    const expiredCall = tickInterviewTimer(firstCall, firstCall.deadline!);

    expect(expiredCall).toMatchObject({ remainingMs: 0, hasExpired: true });

    const restartedCall = startInterviewTimer(firstCall.deadline! + 2_000);

    expect(restartedCall).toEqual({
      deadline: firstCall.deadline! + 2_000 + INTERVIEW_DURATION_MS,
      remainingMs: INTERVIEW_DURATION_MS,
      hasExpired: false
    });
  });

  it("resets a partially elapsed timer while a new call connects", () => {
    const firstCall = startInterviewTimer(1_000);
    const partiallyElapsedCall = tickInterviewTimer(firstCall, 121_000);

    expect(partiallyElapsedCall.remainingMs).toBe(
      INTERVIEW_DURATION_MS - 120_000
    );
    expect(createInterviewTimerState()).toEqual({
      deadline: null,
      remainingMs: INTERVIEW_DURATION_MS,
      hasExpired: false
    });
  });

  it("stops counting down when Lyra disconnects", () => {
    const runningCall = startInterviewTimer(1_000);
    const stoppedCall = stopInterviewTimer(runningCall, 121_000);

    expect(stoppedCall).toEqual({
      deadline: null,
      remainingMs: INTERVIEW_DURATION_MS - 120_000,
      hasExpired: false
    });
    expect(tickInterviewTimer(stoppedCall, 500_000)).toBe(stoppedCall);
  });

  it.each([
    [600_000, "10:00"],
    [599_001, "10:00"],
    [599_000, "09:59"],
    [61_000, "01:01"],
    [1, "00:01"],
    [0, "00:00"],
    [-1, "00:00"]
  ])("formats %i milliseconds as %s", (milliseconds, expected) => {
    expect(formatInterviewTime(milliseconds)).toBe(expected);
  });
});
