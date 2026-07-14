import { useCallback, useEffect, useRef, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import type { CanvasState } from "@/components/canvas/model/types";
import {
  getCanvasStorage,
  loadCanvasState,
  saveCanvasState
} from "@/components/canvas/persistence/canvasStorage";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import { initialSystemDesignCanvas } from "@/utils/interview/initialCanvas";

export function App() {
  const [canvasStorage] = useState(getCanvasStorage);
  const [initialCanvas] = useState(() =>
    loadCanvasState(canvasStorage, initialSystemDesignCanvas)
  );
  const [canvasText, setCanvasText] = useState(
    () => serializeCanvasToText(initialCanvas).text
  );
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);

  const handleCanvasTextChange = useCallback((text: string) => {
    setCanvasText(text);
  }, []);
  const pendingCanvasStateRef = useRef<CanvasState | null>(null);
  const persistenceTimerRef = useRef<number | null>(null);

  const flushCanvasPersistence = useCallback(() => {
    if (persistenceTimerRef.current !== null) {
      window.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = null;
    }
    const pending = pendingCanvasStateRef.current;
    pendingCanvasStateRef.current = null;
    if (pending) saveCanvasState(canvasStorage, pending);
  }, [canvasStorage]);

  const handleCanvasChange = useCallback((state: CanvasState) => {
    pendingCanvasStateRef.current = state;
    if (persistenceTimerRef.current !== null) return;
    persistenceTimerRef.current = window.setTimeout(
      flushCanvasPersistence,
      120
    );
  }, [flushCanvasPersistence]);

  useEffect(() => {
    window.addEventListener("pagehide", flushCanvasPersistence);
    return () => {
      window.removeEventListener("pagehide", flushCanvasPersistence);
      flushCanvasPersistence();
    };
  }, [flushCanvasPersistence]);

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      <div className="absolute inset-0">
        <SystemDesignCanvas
          initialState={initialCanvas}
          className="h-full"
          onCanvasChange={handleCanvasChange}
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
