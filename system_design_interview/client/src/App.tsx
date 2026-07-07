import { useCallback, useState } from "react";
import { SystemDesignCanvas } from "@kfl-system-design/infinite-canvas";

import {
  FloatingAvatarWindow,
  type CanvasSyncStatus
} from "./features/avatar/FloatingAvatarWindow";
import { initialSystemDesignCanvas } from "./features/interview/initialCanvas";

const initialCanvasSyncStatus: CanvasSyncStatus = {
  isReady: false,
  isSending: false,
  pendingEdits: 0,
  lastSentAt: null,
  lastSentVersion: 0,
  error: null
};

export function App() {
  const [canvasText, setCanvasText] = useState("Canvas v8");
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(initialCanvasSyncStatus);

  const handleCanvasTextChange = useCallback((text: string) => {
    setCanvasText(text);
  }, []);

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      <div className="absolute inset-0">
        <SystemDesignCanvas
          initialState={initialSystemDesignCanvas}
          className="h-full"
          onCanvasTextChange={handleCanvasTextChange}
        />
      </div>

      <CanvasSyncIndicator status={canvasSyncStatus} />

      <FloatingAvatarWindow
        canvasText={canvasText}
        onCanvasSyncStatusChange={setCanvasSyncStatus}
      />
    </main>
  );
}

function CanvasSyncIndicator({ status }: { status: CanvasSyncStatus }) {
  const shouldShow =
    status.isReady ||
    status.isSending ||
    status.pendingEdits > 0 ||
    status.lastSentAt !== null ||
    status.error !== null;

  if (!shouldShow) {
    return null;
  }

  const primaryText = getCanvasSyncPrimaryText(status);
  const dotClassName = status.error
    ? "bg-red-500"
    : status.pendingEdits > 0
      ? "bg-amber-500"
      : status.isSending || !status.lastSentAt
      ? "bg-cyan-500"
      : "bg-teal-600";

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-30 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-600 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dotClassName}`} />
        <span className="font-medium text-slate-700">{primaryText}</span>
      </div>
    </div>
  );
}

function getCanvasSyncPrimaryText(status: CanvasSyncStatus): string {
  if (status.error) {
    return "Canvas send issue";
  }

  if (status.pendingEdits > 0) {
    return "Canvas pending";
  }

  if (status.isSending || !status.lastSentAt) {
    return "Syncing";
  }

  return "Synced";
}
