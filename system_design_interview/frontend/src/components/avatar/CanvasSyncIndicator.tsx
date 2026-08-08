import { Badge } from "@/components/ui/badge";
import type { CanvasSyncStatus } from "@/utils/avatar/canvasContextSync";

export function CanvasSyncIndicator({ status }: { status: CanvasSyncStatus }) {
  const label = status.error
    ? "Canvas send issue"
    : status.lastSentAt !== null && !status.isSending && !status.hasPendingUpdate
      ? "Synced"
      : "Syncing";

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
      {label}
    </Badge>
  );
}
