export const DEFAULT_CONTEXT_HASH_INTERVAL_MS = 200;
export const DEFAULT_CONTEXT_SEND_INTERVAL_MS = 1000;

export type CanvasContextBufferSender = (
  text: string
) => void | Promise<void>;

export type CanvasContextBufferStatus = {
  isRunning: boolean;
  isSending: boolean;
  hasPendingUpdate: boolean;
  lastSentAt: number | null;
  lastSentHash: string | null;
  error: string | null;
};

export type CanvasContextBufferOptions = {
  hashIntervalMs?: number;
  sendIntervalMs?: number;
  now?: () => number;
  onStatusChange?: (status: CanvasContextBufferStatus) => void;
};

export type CanvasContextBuffer = {
  push(text: string): void;
  start(): void;
  stop(): void;
  getStatus(): CanvasContextBufferStatus;
};

type TimerHandle = ReturnType<typeof setInterval>;

export function createCanvasContextBuffer(
  sender: CanvasContextBufferSender,
  options: CanvasContextBufferOptions = {}
): CanvasContextBuffer {
  const hashIntervalMs = normalizeInterval(
    options.hashIntervalMs,
    DEFAULT_CONTEXT_HASH_INTERVAL_MS
  );
  const sendIntervalMs = normalizeInterval(
    options.sendIntervalMs,
    DEFAULT_CONTEXT_SEND_INTERVAL_MS
  );
  const now = options.now ?? Date.now;
  let hashTimer: TimerHandle | undefined;
  let sendTimer: TimerHandle | undefined;
  let latestText: string | undefined;
  let observedHash: string | null = null;
  let pendingText: string | undefined;
  let pendingHash: string | null = null;
  let lastSentHash: string | null = null;
  let lastSentAt: number | null = null;
  let isSending = false;
  let error: string | null = null;

  function push(text: string): void {
    latestText = text;
  }

  function start(): void {
    if (hashTimer || sendTimer) {
      return;
    }

    hashTimer = setInterval(sampleLatestText, hashIntervalMs);
    sendTimer = setInterval(() => {
      void sendPendingText();
    }, sendIntervalMs);
    emitStatus();
  }

  function stop(): void {
    if (hashTimer) {
      clearInterval(hashTimer);
      hashTimer = undefined;
    }
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = undefined;
    }
    emitStatus();
  }

  function getStatus(): CanvasContextBufferStatus {
    return {
      isRunning: Boolean(hashTimer || sendTimer),
      isSending,
      hasPendingUpdate: pendingHash !== null,
      lastSentAt,
      lastSentHash,
      error
    };
  }

  function sampleLatestText(): void {
    if (latestText === undefined) {
      return;
    }

    const nextHash = hashText(latestText);
    if (nextHash === observedHash) {
      return;
    }

    observedHash = nextHash;
    if (nextHash === lastSentHash) {
      pendingText = undefined;
      pendingHash = null;
    } else {
      pendingText = latestText;
      pendingHash = nextHash;
      error = null;
    }
    emitStatus();
  }

  async function sendPendingText(): Promise<void> {
    if (isSending || pendingText === undefined || pendingHash === null) {
      return;
    }

    const textToSend = pendingText;
    const hashToSend = pendingHash;
    isSending = true;
    emitStatus();

    try {
      await sender(textToSend);
      lastSentHash = hashToSend;
      lastSentAt = now();
      error = null;

      if (pendingHash === hashToSend) {
        pendingText = undefined;
        pendingHash = null;
      }
    } catch (err) {
      error = formatError(err);
    } finally {
      isSending = false;
      emitStatus();
    }
  }

  function emitStatus(): void {
    options.onStatusChange?.(getStatus());
  }

  return {
    push,
    start,
    stop,
    getStatus
  };
}

export function hashText(text: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function normalizeInterval(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.round(value);
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}
