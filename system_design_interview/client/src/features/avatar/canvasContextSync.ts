import {
  createCanvasContextBuffer,
  type CanvasContextBuffer,
  type CanvasContextBufferOptions,
  type CanvasContextBufferStatus
} from "./canvasContextBuffer";
import { buildCanvasContextualUpdate } from "./context";

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
