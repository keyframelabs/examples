import "@xyflow/react/dist/style.css";
import { useEffect, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import { FloatingAvatarWindow } from "@/components/avatar/FloatingAvatarWindow";
import type { InterviewStartup } from "@/components/avatar/useInterviewMediaSession";
import "@/components/canvas/canvas.css";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import type { CanvasRightOcclusion } from "@/components/canvas/fitView";
import { createEmptyCanvasState } from "@/components/canvas/model/state";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { InterviewPacket } from "@/lib/api";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  registerSessionLossWarning,
  shouldWarnAboutSessionLoss
} from "@/utils/sessionLossWarning";

const EMPTY_CANVAS_TEXT = serializeCanvasToText(createEmptyCanvasState()).text;

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
  const shouldWarnBeforeUnload = shouldWarnAboutSessionLoss({
    hasCanvasEdits,
    isSessionActive: canvasSyncStatus.isReady
  });

  useEffect(() => {
    if (!shouldWarnBeforeUnload) return;
    return registerSessionLossWarning(window);
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
