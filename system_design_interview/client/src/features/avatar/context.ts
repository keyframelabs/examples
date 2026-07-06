interface CanvasContextualUpdateOptions {
  version?: number;
}

export function buildCanvasContextualUpdate(
  canvasText: string,
  options: CanvasContextualUpdateOptions = {}
): string {
  const text = normalizeCanvasText(canvasText);
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

function normalizeCanvasText(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
