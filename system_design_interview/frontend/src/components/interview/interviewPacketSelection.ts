import type { InterviewPacket } from "@/lib/api";

export const SKILL_LEVELS = ["Intern", "Junior", "Senior"] as const;

export type SkillLevel = InterviewPacket["skillLevel"];

export function getAvailableSkillLevels(
  packets: readonly InterviewPacket[]
): ReadonlySet<SkillLevel> {
  return new Set(packets.map((packet) => packet.skillLevel));
}

export function getInitialSkillLevel(
  packets: readonly InterviewPacket[]
): SkillLevel {
  return SKILL_LEVELS.find((skillLevel) =>
    packets.some((packet) => packet.skillLevel === skillLevel)
  ) ?? "Intern";
}
