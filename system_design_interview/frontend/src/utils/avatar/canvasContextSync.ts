const HASH_INTERVAL_MS = 200;
const SEND_INTERVAL_MS = 1000;

export type CanvasSyncStatus = {
  isReady: boolean;
  isSending: boolean;
  hasPendingUpdate: boolean;
  lastSentAt: number | null;
  error: string | null;
};

export const INITIAL_CANVAS_SYNC_STATUS: CanvasSyncStatus = {
  isReady: false,
  isSending: false,
  hasPendingUpdate: false,
  lastSentAt: null,
  error: null
};

export type CanvasContextSync = {
  push(text: string): void;
  start(): void;
  stop(): void;
  getStatus(): CanvasSyncStatus;
};

type CanvasContextSyncOptions = {
  sendContextUpdate: (text: string) => void | Promise<void>;
  onStatusChange?: (status: CanvasSyncStatus) => void;
};

/**
 * Streams canvas snapshots to the interview agent: samples the latest pushed
 * text every 200ms, hashes it to skip unchanged canvases, and sends at most
 * one versioned contextual update per second. Failed sends keep the update
 * pending so the next tick retries it.
 */
export function createCanvasContextSync(
  options: CanvasContextSyncOptions
): CanvasContextSync {
  let hashTimer: ReturnType<typeof setInterval> | undefined;
  let sendTimer: ReturnType<typeof setInterval> | undefined;
  let latestText: string | undefined;
  let observedHash: string | null = null;
  let pendingText: string | undefined;
  let lastSentHash: string | null = null;
  let lastSentAt: number | null = null;
  let version = 0;
  let isSending = false;
  let error: string | null = null;

  function getStatus(): CanvasSyncStatus {
    return {
      isReady: Boolean(hashTimer || sendTimer),
      isSending,
      hasPendingUpdate: pendingText !== undefined,
      lastSentAt,
      error
    };
  }

  function emitStatus(): void {
    options.onStatusChange?.(getStatus());
  }

  function syncPendingWithLatestText(): void {
    if (latestText === undefined) return;

    observedHash = hashText(latestText);
    pendingText = observedHash === lastSentHash ? undefined : latestText;
    error = null;
  }

  function sampleLatestText(): void {
    if (latestText === undefined || hashText(latestText) === observedHash) {
      return;
    }

    syncPendingWithLatestText();
    emitStatus();
  }

  async function sendPendingText(): Promise<void> {
    if (isSending || pendingText === undefined) return;

    const text = pendingText;
    const hash = hashText(text);
    isSending = true;
    emitStatus();

    try {
      await options.sendContextUpdate(contextualUpdate(text, version + 1));
      version += 1;
      lastSentHash = hash;
      lastSentAt = Date.now();
      error = null;
      syncPendingWithLatestText();
    } catch (sendError) {
      error =
        sendError instanceof Error ? sendError.message : String(sendError);
    } finally {
      isSending = false;
      emitStatus();
    }
  }

  return {
    push(text) {
      latestText = text;
    },
    start() {
      if (hashTimer || sendTimer) return;
      hashTimer = setInterval(sampleLatestText, HASH_INTERVAL_MS);
      sendTimer = setInterval(() => void sendPendingText(), SEND_INTERVAL_MS);
      emitStatus();
    },
    stop() {
      clearInterval(hashTimer);
      clearInterval(sendTimer);
      hashTimer = undefined;
      sendTimer = undefined;
      emitStatus();
    },
    getStatus
  };
}

function contextualUpdate(canvasText: string, version: number): string {
  const text = canvasText
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return [
    "Current system design canvas state for the interview:",
    `CanvasState update: ${version}`,
    "This is the latest complete canvas snapshot and supersedes earlier canvas state contextual updates.",
    text || "Canvas is empty.",
    "Use this as background context for the next interview turn. Do not react to the update by itself."
  ].join("\n");
}

/** FNV-1a; cheap fingerprint to detect canvas text changes. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
