import { describe, expect, it } from "vitest";

import {
  createInterviewDeadline,
  formatInterviewTime,
  INTERVIEW_DURATION_MS,
  interviewTimeRemaining
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
