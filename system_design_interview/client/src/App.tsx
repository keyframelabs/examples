import { useCallback, useState } from "react";
import { SystemDesignCanvas } from "@kfl-system-design/infinite-canvas";

import {
  FloatingAvatarWindow,
  type CanvasSyncStatus
} from "./components/avatar/FloatingAvatarWindow";
import { initialSystemDesignCanvas } from "./components/interview/initialCanvas";

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
  if (!status.isReady) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 inline-flex h-[42px] items-center rounded-lg border border-slate-200 bg-white/95 px-3 text-xs font-medium text-slate-700 shadow-toolbar backdrop-blur"
    >
      {getCanvasSyncPrimaryText(status)}
    </div>
  );
}

function getCanvasSyncPrimaryText(status: CanvasSyncStatus): string {
  if (
    status.lastSentAt !== null &&
    !status.isSending &&
    status.pendingEdits === 0 &&
    !status.error
  ) {
    return "Synced";
  }

  return "Syncing";
}
