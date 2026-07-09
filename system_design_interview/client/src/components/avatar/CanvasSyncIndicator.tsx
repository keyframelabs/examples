import { Badge } from "@kfl-system-design/ui/components/badge";
import type { CanvasSyncStatus } from "@/types/canvas-sync-status";

type CanvasSyncIndicatorProps = {
  status: CanvasSyncStatus;
};

export function CanvasSyncIndicator({ status }: CanvasSyncIndicatorProps) {
  if (!status.isReady) {
    return null;
  }

  return (
    <Badge
      aria-live="polite"
      variant={status.error ? "destructive" : "outline"}
      className="pointer-events-none fixed bottom-4 right-4 z-30 h-[42px] rounded-lg bg-card/95 px-3 text-muted-foreground shadow-toolbar backdrop-blur"
    >
      {getCanvasSyncPrimaryText(status)}
    </Badge>
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
