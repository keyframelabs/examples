import {
  createCanvasContextBuffer,
  type CanvasContextBuffer,
  type CanvasContextBufferOptions,
  type CanvasContextBufferStatus
} from "./canvasContextBuffer";

interface CanvasContextualUpdateOptions {
  version?: number;
}

export type CanvasContextSyncStatus = {
  isRunning: boolean;
  isSending: boolean;
  pendingEdits: number;
  lastSentAt: number | null;
  lastSentVersion: number;
  error: string | null;
};

export type CanvasContextSyncOptions = {
  sendContextUpdate: (text: string) => void | Promise<void>;
  hashIntervalMs?: number;
  sendIntervalMs?: number;
  now?: () => number;
  onStatusChange?: (status: CanvasContextSyncStatus) => void;
};

export type CanvasContextSync = {
  push(text: string): void;
  start(): void;
  stop(): void;
  getStatus(): CanvasContextSyncStatus;
};

export function createCanvasContextSync(
  options: CanvasContextSyncOptions
): CanvasContextSync {
  let lastSentVersion = 0;
  let buffer: CanvasContextBuffer;

  const bufferOptions: CanvasContextBufferOptions = {
    hashIntervalMs: options.hashIntervalMs,
    sendIntervalMs: options.sendIntervalMs,
    now: options.now,
    onStatusChange: (status) => {
      options.onStatusChange?.(mapStatus(status, lastSentVersion));
    }
  };

  buffer = createCanvasContextBuffer(async (summary) => {
    const version = lastSentVersion + 1;
    await options.sendContextUpdate(
      buildCanvasContextualUpdate(summary, { version })
    );
    lastSentVersion = version;
  }, bufferOptions);

  return {
    push: buffer.push,
    start: buffer.start,
    stop: buffer.stop,
    getStatus: () => mapStatus(buffer.getStatus(), lastSentVersion)
  };
}

function mapStatus(
  status: CanvasContextBufferStatus,
  lastSentVersion: number
): CanvasContextSyncStatus {
  return {
    isRunning: status.isRunning,
    isSending: status.isSending,
    pendingEdits: status.hasPendingUpdate ? 1 : 0,
    lastSentAt: status.lastSentAt,
    lastSentVersion,
    error: status.error
  };
}

function buildCanvasContextualUpdate(
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
