import type { CanvasSyncStatus } from "@/types/canvas-sync-status";

type CanvasSyncIndicatorProps = {
  status: CanvasSyncStatus;
};

export function CanvasSyncIndicator({ status }: CanvasSyncIndicatorProps) {
  if (!status.isReady) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-30 inline-flex h-[42px] items-center rounded-lg border border-slate-200 bg-white/95 px-3 text-xs font-medium text-slate-700 shadow-toolbar backdrop-blur"
    >
      {getCanvasSyncPrimaryText(status)}
    </div>
  );
}

export function getCanvasSyncPrimaryText(status: CanvasSyncStatus): string {
  if (status.error) {
    return "Canvas send issue";
  }

  if (
    status.lastSentAt !== null &&
    !status.isSending &&
    status.pendingEdits === 0
  ) {
    return "Synced";
  }

  return "Syncing";
}
