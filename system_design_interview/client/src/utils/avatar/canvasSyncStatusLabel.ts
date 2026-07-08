import type { CanvasSyncStatus } from "./canvasSyncStatus";

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
