export type AvatarTiming = { text: string; startMs: number; durationMs: number };

const emotionTag = () => /\[\s*(?:(?:emotion|mood)\s*[:=]\s*)?[\p{L}][\p{L}\p{M}\s-]{0,31}\s*\]\s*/giu;
const dialogueWrapper = () => /^\s*\[([^\[\]]*[.!?¿¡][^\[\]]*)\]\s*$/u;

export function visiblePersonaText(text: string): string {
  return text
    .replace(emotionTag(), "")
    .replace(dialogueWrapper(), "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function visiblePersonaTiming(timing: AvatarTiming[]): AvatarTiming[] {
  const text = timing.map((item) => item.text).join("");
  const ranges = [emotionTag()]
    .flatMap((pattern) => Array.from(text.matchAll(pattern), (match) => ({
      start: match.index,
      end: match.index + match[0].length
    })))
    .sort((left, right) => left.start - right.start);
  if (dialogueWrapper().test(text)) {
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
