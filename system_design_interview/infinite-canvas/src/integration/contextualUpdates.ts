import type { CanvasState } from "#/canvas/model/types";
import { serializeCanvasToText } from "#/canvas/serializer/serializeCanvas";

export const DEFAULT_CONTEXTUAL_UPDATE_INTERVAL_MS = 7000;
export const MIN_CONTEXTUAL_UPDATE_INTERVAL_MS = 5000;
export const MAX_CONTEXTUAL_UPDATE_INTERVAL_MS = 10000;

export type ContextualUpdateSender = (
  text: string,
  state: CanvasState
) => void | Promise<void>;

export interface ContextualUpdateOptions {
  intervalMs?: number;
}

export interface ContextualUpdateAdapter {
  push(state: CanvasState): void;
  flush(state?: CanvasState): Promise<boolean>;
  start(): void;
  stop(): void;
}

type TimerHandle = ReturnType<typeof setInterval>;

export function createContextualUpdateAdapter(
  sender: ContextualUpdateSender,
  options: ContextualUpdateOptions = {}
): ContextualUpdateAdapter {
  const intervalMs = normalizeIntervalMs(options.intervalMs);
  let timer: TimerHandle | undefined;
  let latestState: CanvasState | undefined;
  let lastSentText: string | undefined;
  let activeFlush: Promise<boolean> | undefined;
  let flushAgain = false;

  async function flush(state?: CanvasState): Promise<boolean> {
    if (state) {
      latestState = state;
    }

    if (activeFlush) {
      flushAgain = true;
      return activeFlush;
    }

    const run = flushLoop();
    activeFlush = run;

    try {
      return await run;
    } finally {
      if (activeFlush === run) {
        activeFlush = undefined;
      }
    }
  }

  async function flushLoop(): Promise<boolean> {
    let sent = false;

    do {
      flushAgain = false;

      const stateToSend = latestState;
      if (!stateToSend) {
        break;
      }

      const text = serializeState(stateToSend);
      if (!text || text === lastSentText) {
        continue;
      }

      await sender(text, stateToSend);
      lastSentText = text;
      sent = true;
    } while (flushAgain);

    return sent;
  }

  function push(state: CanvasState): void {
    latestState = state;
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void flush();
    }, intervalMs);
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  return {
    push,
    flush,
    start,
    stop
  };
}

function normalizeIntervalMs(intervalMs?: number): number {
  if (intervalMs === undefined || !Number.isFinite(intervalMs)) {
    return DEFAULT_CONTEXTUAL_UPDATE_INTERVAL_MS;
  }

  return Math.min(
    MAX_CONTEXTUAL_UPDATE_INTERVAL_MS,
    Math.max(MIN_CONTEXTUAL_UPDATE_INTERVAL_MS, Math.round(intervalMs))
  );
}

function serializeState(state: CanvasState): string {
  return serializeCanvasToText(state).text;
}
