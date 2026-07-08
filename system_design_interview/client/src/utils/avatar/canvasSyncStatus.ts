export type CanvasSyncStatus = {
  isReady: boolean;
  isSending: boolean;
  pendingEdits: number;
  lastSentAt: number | null;
  lastSentVersion: number;
  error: string | null;
};
