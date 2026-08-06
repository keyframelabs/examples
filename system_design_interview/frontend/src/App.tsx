import { useCallback, useEffect, useRef, useState } from "react";

import { CanvasSyncIndicator } from "@/components/avatar/CanvasSyncIndicator";
import {
  FloatingAvatarWindow,
  type InterviewStartup
} from "@/components/avatar/FloatingAvatarWindow";
import { SystemDesignCanvas } from "@/components/canvas/SystemDesignCanvas";
import { createEmptyCanvasState } from "@/components/canvas/model/state";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import { InterviewPacketLanding } from "@/components/interview/InterviewPacketLanding";
import {
  createLiveSession,
  type InterviewPacket
} from "@/lib/api";
import {
  INITIAL_CANVAS_SYNC_STATUS,
  type CanvasSyncStatus
} from "@/utils/avatar/canvasContextSync";
import {
  registerSessionLossWarning,
  shouldWarnAboutSessionLoss
} from "@/utils/sessionLossWarning";
import { requestUserCamera } from "@/utils/interview/userCamera";

const EMPTY_CANVAS_TEXT = serializeCanvasToText(createEmptyCanvasState()).text;

type InterviewStage = "selection" | "introduction" | "canvas";

// Keep the side-by-side introduction implemented but dormant until KEY-97 can
// use the js/elements tool-call support tracked by KEY-23.
const INTERVIEW_ENTRY_STAGE: Exclude<InterviewStage, "selection"> = "canvas";

export function App() {
  const [interviewStage, setInterviewStage] =
    useState<InterviewStage>("selection");
  const [selectedPacket, setSelectedPacket] = useState<InterviewPacket | null>(
    null
  );
  const [interviewStartup, setInterviewStartup] =
    useState<InterviewStartup | null>(null);
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

  const handleReturnToSelection = useCallback(() => {
    setInterviewStage("selection");
    setSelectedPacket(null);
    setInterviewStartup(null);
    setCanvasSessionId((current) => current + 1);
    setCanvasText(EMPTY_CANVAS_TEXT);
    setHasCanvasEdits(false);
    setCanvasSyncStatus(INITIAL_CANVAS_SYNC_STATUS);
  }, []);

  const handleStartInterview = useCallback((packet: InterviewPacket) => {
    const cameraRequest = requestUserCamera();
    const liveSessionRequest = createLiveSession(packet.packetId);
    void cameraRequest.catch(() => undefined);
    void liveSessionRequest.catch(() => undefined);

    const startup = {
      cameraRequest,
      liveSessionRequest
    };

    setSelectedPacket(packet);
    setInterviewStartup(startup);
    setInterviewStage(INTERVIEW_ENTRY_STAGE);
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

      {interviewStage === "selection" ? (
        <InterviewPacketLanding
          onStartInterview={handleStartInterview}
        />
      ) : null}

      {interviewStage !== "selection" && selectedPacket && interviewStartup ? (
        <FloatingAvatarWindow
          canvasText={canvasText}
          packet={selectedPacket}
          startup={interviewStartup}
          stage={interviewStage}
          onEnterCanvas={() => setInterviewStage("canvas")}
          onReturnToSelection={handleReturnToSelection}
          onCanvasSyncStatusChange={setCanvasSyncStatus}
        />
      ) : null}
    </main>
  );
}
