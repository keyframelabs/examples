import { useCallback, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import type { CanvasSyncStatus } from "@/types/canvas-sync-status";
import { initialSystemDesignCanvas } from "@/utils/interview/initialCanvas";

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
