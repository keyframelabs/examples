const MAX_CONTEXT_CHARS = 5500;

interface CanvasContextualUpdateOptions {
  version?: number;
}

export function buildCanvasContextualUpdate(
  canvasText: string,
  options: CanvasContextualUpdateOptions = {}
): string {
  const text = compact(canvasText, MAX_CONTEXT_CHARS);
  const versionLine =
    options.version === undefined
      ? undefined
      : `CanvasState update: ${options.version}`;

  return [
    "Current system design canvas state for the interview:",
    versionLine,
    "This is the latest complete canvas snapshot and supersedes earlier canvas state contextual updates.",
    text || "Canvas is empty.",
    "Use this as background context for the next interview turn. Do not react to the update by itself."
  ].filter(Boolean).join("\n");
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxLength - 3);
  const boundary = clipped.lastIndexOf("\n");
  return `${clipped.slice(0, boundary > 400 ? boundary : clipped.length).trimEnd()}...`;
}
