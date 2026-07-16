import { useCallback, useEffect, useRef, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import { createEmptyCanvasState } from "@/components/canvas/model/state";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  registerSessionLossWarning,
  shouldWarnAboutSessionLoss
} from "@/utils/sessionLossWarning";

const EMPTY_CANVAS_TEXT = serializeCanvasToText(createEmptyCanvasState()).text;

export function App() {
  const [interviewStage, setInterviewStage] = useState<
    "introduction" | "canvas"
  >("introduction");
  const [canvasSessionId, setCanvasSessionId] = useState(0);
  const [canvasText, setCanvasText] = useState(EMPTY_CANVAS_TEXT);
  const [hasCanvasEdits, setHasCanvasEdits] = useState(false);
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const currentCanvasSessionIdRef = useRef(canvasSessionId);
  currentCanvasSessionIdRef.current = canvasSessionId;
  const shouldWarnBeforeUnload = shouldWarnAboutSessionLoss({
    hasCanvasEdits,
    isSessionActive: canvasSyncStatus.isReady
  });

  const handleCanvasTextChange = useCallback(
    (text: string) => {
      if (canvasSessionId !== currentCanvasSessionIdRef.current) return;
      setCanvasText(text);
    },
    [canvasSessionId]
  );

  const handleReturnToIntroduction = useCallback(() => {
    setInterviewStage("introduction");
    setCanvasSessionId((current) => current + 1);
    setCanvasText(EMPTY_CANVAS_TEXT);
    setHasCanvasEdits(false);
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
          key={canvasSessionId}
          className="h-full"
          isInteractive={interviewStage === "canvas"}
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
        onReturnToIntroduction={handleReturnToIntroduction}
        onCanvasSyncStatusChange={setCanvasSyncStatus}
      />
    </main>
  );
}
