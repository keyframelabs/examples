import { describe, expect, it } from "vitest";

import {
  getAvailableSkillLevels,
  getInitialSkillLevel
} from "@/components/interview/interviewPacketSelection";
import type { InterviewPacket } from "@/lib/api";

function packet(
  packetId: string,
  skillLevel: InterviewPacket["skillLevel"]
): InterviewPacket {
  return {
    packetId,
    title: packetId,
    summary: "",
    questionNumber: 1,
    skillLevel,
    difficulty: "Beginner",
    focus: [],
    tags: []
  };
}

describe("interview packet skill levels", () => {
  it("selects and exposes only skill levels present in a sparse catalog", () => {
    const packets = [packet("senior-packet", "Senior")];

    expect([...getAvailableSkillLevels(packets)]).toEqual(["Senior"]);
    expect(getInitialSkillLevel(packets)).toBe("Senior");
  });
});
