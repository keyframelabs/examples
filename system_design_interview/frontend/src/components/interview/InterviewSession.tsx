import "@xyflow/react/dist/style.css";
import { useEffect, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import type { InterviewStartup } from "@/components/avatar/useInterviewMediaSession";
import "@/components/canvas/canvas.css";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import type { CanvasRightOcclusion } from "@/components/canvas/fitView";
import { EMPTY_CANVAS_TEXT } from "@/components/canvas/serialize";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { InterviewPacket } from "@/lib/api";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";

type InterviewSessionProps = {
  packet: InterviewPacket;
  startup: InterviewStartup;
  onExit: () => void;
};

export default function InterviewSession({
  packet,
  startup,
  onExit
}: InterviewSessionProps) {
  const [canvasText, setCanvasText] = useState(EMPTY_CANVAS_TEXT);
  const [hasCanvasEdits, setHasCanvasEdits] = useState(false);
  const [canvasSyncStatus, setCanvasSyncStatus] =
    useState<CanvasSyncStatus>(INITIAL_CANVAS_SYNC_STATUS);
  const [canvasRightOcclusion, setCanvasRightOcclusion] =
    useState<CanvasRightOcclusion | null>(null);
  // Warn before losing an active session or unsaved canvas work.
  const shouldWarnBeforeUnload = hasCanvasEdits || canvasSyncStatus.isReady;

  useEffect(() => {
    if (!shouldWarnBeforeUnload) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [shouldWarnBeforeUnload]);

  return (
    <TooltipProvider delayDuration={250}>
      <SystemDesignCanvas
        rightOcclusion={canvasRightOcclusion}
        onCanvasDirtyChange={setHasCanvasEdits}
        onCanvasTextChange={setCanvasText}
        toolbarEnd={
          canvasSyncStatus.isReady ? (
            <CanvasSyncIndicator status={canvasSyncStatus} />
          ) : null
        }
      />
      <FloatingAvatarWindow
        canvasText={canvasText}
        packet={packet}
        startup={startup}
        onReturnToSelection={onExit}
        onCanvasSyncStatusChange={setCanvasSyncStatus}
        onCanvasRightOcclusionChange={setCanvasRightOcclusion}
      />
    </TooltipProvider>
  );
}
