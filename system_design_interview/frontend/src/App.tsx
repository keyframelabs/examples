import { useCallback, useEffect, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import { SessionLossWarning } from "@/components/interview/SessionLossWarning";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import { initialSystemDesignCanvas } from "@/utils/interview/initialCanvas";
import {
  registerSessionLossWarning,
  shouldWarnAboutSessionLoss
} from "@/utils/sessionLossWarning";

export function App() {
  const [canvasText, setCanvasText] = useState(
    () => serializeCanvasToText(initialSystemDesignCanvas).text
  );
  const [hasCanvasEdits, setHasCanvasEdits] = useState(false);
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);
  const shouldWarnBeforeUnload = shouldWarnAboutSessionLoss({
    hasCanvasEdits,
    isSessionActive: canvasSyncStatus.isReady
  });

  const handleCanvasTextChange = useCallback((text: string) => {
    setCanvasText(text);
  }, []);

  useEffect(() => {
    if (!shouldWarnBeforeUnload) return;
    return registerSessionLossWarning(window);
  }, [shouldWarnBeforeUnload]);

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      <div className="absolute inset-0">
        <SystemDesignCanvas
          initialState={initialSystemDesignCanvas}
          className="h-full"
          onCanvasDirtyChange={setHasCanvasEdits}
          onCanvasTextChange={handleCanvasTextChange}
        />
      </div>

      <SessionLossWarning />

      <CanvasSyncIndicator status={canvasSyncStatus} />

      <FloatingAvatarWindow
        canvasText={canvasText}
        onCanvasSyncStatusChange={setCanvasSyncStatus}
      />
    </main>
  );
}
