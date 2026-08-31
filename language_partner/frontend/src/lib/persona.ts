export type AvatarTiming = { text: string; startMs: number; durationMs: number };

const emotionTagPattern = () => /\[\s*(?:(?:emotion|mood)\s*[:=]\s*)?[\p{L}][\p{L}\p{M}\s-]{0,31}\s*\]\s*/giu;
const dialogueWrapperPattern = /^\s*\[([^\[\]]*[.!?¿¡][^\[\]]*)\]\s*$/u;

export function visiblePersonaText(text: string): string {
  return text
    .replace(emotionTagPattern(), "")
    .replace(dialogueWrapperPattern, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function visiblePersonaTiming(timing: AvatarTiming[]): AvatarTiming[] {
  const text = timing.map((item) => item.text).join("");
  const ranges = Array.from(text.matchAll(emotionTagPattern()), (match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));
  if (dialogueWrapperPattern.test(text)) {
    ranges.push(
      { start: text.indexOf("["), end: text.indexOf("[") + 1 },
      { start: text.lastIndexOf("]"), end: text.lastIndexOf("]") + 1 }
    );
  }
  if (!ranges.length) return timing;
  let offset = 0;
  return timing.filter((item) => {
    const start = offset;
    const end = start + item.text.length;
    offset = end;
    return !ranges.some((range) => start < range.end && end > range.start);
  });
}
