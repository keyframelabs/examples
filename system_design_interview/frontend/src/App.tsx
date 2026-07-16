import { useCallback, useEffect, useRef, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
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
  const [interviewStage, setInterviewStage] = useState<
    "introduction" | "canvas"
  >("introduction");
  const [canvasText, setCanvasText] = useState(
    () => serializeCanvasToText(initialSystemDesignCanvas).text
  );
  const [hasCanvasEdits, setHasCanvasEdits] = useState(false);
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    canvasContainerRef.current?.toggleAttribute(
      "inert",
      interviewStage !== "canvas"
    );
  }, [interviewStage]);

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      <div
        ref={canvasContainerRef}
        className={
          interviewStage === "canvas"
            ? "absolute inset-0 opacity-100"
            : "pointer-events-none absolute inset-0 opacity-0"
        }
        aria-hidden={interviewStage !== "canvas"}
      >
        <SystemDesignCanvas
          initialState={initialSystemDesignCanvas}
          className="h-full"
          onCanvasDirtyChange={setHasCanvasEdits}
          onCanvasTextChange={handleCanvasTextChange}
          toolbarEnd={
            canvasSyncStatus.isReady ? (
              <CanvasSyncIndicator status={canvasSyncStatus} />
            ) : null
          }
        />
      </div>

      <FloatingAvatarWindow
        canvasText={canvasText}
        stage={interviewStage}
        onEnterCanvas={() => setInterviewStage("canvas")}
        onReturnToIntroduction={() => setInterviewStage("introduction")}
        onCanvasSyncStatusChange={setCanvasSyncStatus}
      />
    </main>
  );
}
