import { useCallback, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import { initialSystemDesignCanvas } from "@/utils/interview/initialCanvas";

export function App() {
  const [canvasText, setCanvasText] = useState(
    () => serializeCanvasToText(initialSystemDesignCanvas).text
  );
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);

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
