export const MAX_JOB_DESCRIPTION_CHARS = 24000;
export const MAX_RESUME_CHARS = 18000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 80).trim()} ... [trimmed for prompt length]`;
}

