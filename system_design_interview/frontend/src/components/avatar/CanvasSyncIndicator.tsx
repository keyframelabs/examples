import { Badge } from "@/components/ui/badge";
import type { CanvasSyncStatus } from "@/utils/avatar/canvasContextSync";

type CanvasSyncIndicatorProps = {
  status: CanvasSyncStatus;
};

export function CanvasSyncIndicator({ status }: CanvasSyncIndicatorProps) {
  if (!status.isReady) {
    return null;
  }

  return (
    <Badge
      role="status"
      aria-live="polite"
      variant={status.error ? "destructive" : "outline"}
      className={
        status.error
          ? "pointer-events-none h-10 rounded-md px-3 shadow-none"
          : "pointer-events-none h-10 rounded-md border-transparent bg-transparent px-3 text-muted-foreground shadow-none"
      }
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
