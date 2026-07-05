import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CameraOff,
  GripHorizontal,
  Loader2,
  Maximize2,
  Minus,
  MoveDiagonal,
  Phone,
  PhoneOff
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type ReactNode
} from "react";

import personSharpUrl from "@/assets/person-sharp.svg";
import { useFloatingPanel } from "@/components/avatar/useFloatingPanel";
import {
  useInterviewMediaSession,
  type InterviewStartup
} from "@/components/avatar/useInterviewMediaSession";
import {
  measureCanvasRightOcclusion,
  type CanvasRightOcclusion
} from "@/components/canvas/fitView";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { InterviewPacket } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CanvasSyncStatus } from "@/utils/avatar/canvasContextSync";
import { formatInterviewTime } from "@/utils/interview/interviewTimer";

type FloatingAvatarWindowProps = {
  canvasText: string;
  packet: InterviewPacket;
  startup: InterviewStartup;
  onReturnToSelection: () => void;
  onCanvasSyncStatusChange: (status: CanvasSyncStatus) => void;
  onCanvasRightOcclusionChange: (
    occlusion: CanvasRightOcclusion | null
  ) => void;
};

export function FloatingAvatarWindow({
  canvasText,
  packet,
  startup,
  onReturnToSelection,
  onCanvasSyncStatusChange,
  onCanvasRightOcclusionChange
}: FloatingAvatarWindowProps) {
  const {
    panelRef,
    panelSize,
    position,
    minimized,
    setMinimized,
    headerHandlers,
    resizeHandlers
  } = useFloatingPanel();
  const {
    personaContainerRef,
    userVideoRef,
    avatarStatus,
    isEndingCall,
    avatarError,
    cameraStatus,
    cameraError,
    interviewTimeRemainingMs,
    canvasSyncStatus,
    toggleCamera,
    toggleAvatar
  } = useInterviewMediaSession({
    canvasText,
    packet,
    startup,
    onVisibleError: () => setMinimized(false)
  });
  const isCameraOn = cameraStatus === "ready";
  const isCameraChanging = cameraStatus === "requesting";
  const cameraToggleLabel = isCameraChanging
    ? "Turning on camera"
    : isCameraOn
      ? "Turn off camera"
      : "Turn on camera";
  const isConnected = avatarStatus === "connected";
  const isAvatarChanging = avatarStatus === "connecting" || isEndingCall;
  const avatarToggleLabel = isEndingCall
    ? "Turning off avatar"
    : avatarStatus === "connecting"
      ? "Turning on avatar"
      : isConnected
        ? "Turn off avatar"
        : "Turn on avatar";
  const interviewTime = formatInterviewTime(interviewTimeRemainingMs);

  useEffect(() => {
    onCanvasSyncStatusChange(canvasSyncStatus);
  }, [canvasSyncStatus, onCanvasSyncStatusChange]);

  const reportCanvasRightOcclusion = useCallback(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    onCanvasRightOcclusionChange(
      measureCanvasRightOcclusion(rect, window.innerWidth)
    );
  }, [onCanvasRightOcclusionChange, panelRef]);

  useLayoutEffect(() => {
    reportCanvasRightOcclusion();
  }, [
    minimized,
    panelSize.height,
    panelSize.width,
    position.x,
    position.y,
    reportCanvasRightOcclusion
  ]);

  useEffect(() => {
    window.addEventListener("resize", reportCanvasRightOcclusion);
    return () =>
      window.removeEventListener("resize", reportCanvasRightOcclusion);
  }, [reportCanvasRightOcclusion]);

  return (
    <>
      <Card className="fixed right-4 top-4 z-50 bg-card/95 p-1 backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={onReturnToSelection}
            >
              <ArrowLeft className="size-3.5" />
              Interview packets
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            End interview and choose another packet
          </TooltipContent>
        </Tooltip>
      </Card>

      <div
        className="fixed left-0 top-0 z-40"
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`
        }}
      >
        <Card
          ref={panelRef}
          style={{
            width: `${panelSize.width}px`,
            height: minimized ? undefined : `${panelSize.height}px`
          }}
          className={cn(
            "group relative flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-xl",
            !minimized && "w-[min(404px,calc(100vw-24px))]"
          )}
        >
          <div
            className="flex h-9 cursor-move touch-none items-center border-b border-border bg-card px-2"
            {...headerHandlers}
          >
            <GripHorizontal className="size-4 text-muted-foreground" />
            <div className="flex-1 text-center">
              <span
                className="font-mono text-xs font-semibold tabular-nums text-foreground"
                role="timer"
                aria-label={`Interview time remaining ${interviewTime}`}
              >
                {interviewTime}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={
                    minimized ? "Restore video window" : "Minimize video window"
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setMinimized((current) => !current)}
                >
                  {minimized ? (
                    <Maximize2 className="size-4" />
                  ) : (
                    <Minus className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {minimized ? "Restore" : "Minimize"}
              </TooltipContent>
            </Tooltip>
          </div>

          <div
            className={cn(
              !minimized && "flex min-h-0 flex-1 flex-col overflow-hidden"
            )}
          >
            <div
              className={cn(
                "grid min-h-0 flex-1 grid-rows-2 items-center justify-items-center gap-1 p-1",
                minimized && "hidden"
              )}
            >
              <MediaTile
                className="order-2"
                sectionLabel="Your camera preview"
                name="You"
                toggleLabel={cameraToggleLabel}
                togglePressed={isCameraOn}
                toggleDisabled={isCameraChanging}
                toggleBusy={isCameraChanging}
                toggleIcon={
                  isCameraOn ? (
                    <CameraOff className="size-4" />
                  ) : (
                    <Camera className="size-4" />
                  )
                }
                onToggle={toggleCamera}
              >
                <video
                  ref={userVideoRef}
                  className={cn(
                    "h-full w-full scale-x-[-1] object-cover",
                    !isCameraOn && "invisible"
                  )}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Your live camera preview"
                />
                {!isCameraOn ? (
                  <div className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas-avatar-surface">
                    <PersonPlaceholder />
                    <div
                      className="relative z-10 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground shadow-lg"
                      role="status"
                    >
                      {isCameraChanging ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {isCameraChanging
                        ? "Waiting for camera permission"
                        : cameraStatus === "unavailable"
                          ? "Camera unavailable"
                          : cameraStatus === "off"
                            ? "Camera off"
                            : "Preparing camera"}
                    </div>
                  </div>
                ) : null}
              </MediaTile>

              <MediaTile
                className="order-1"
                sectionLabel="Avatar video"
                name="Avatar"
                toggleLabel={avatarToggleLabel}
                togglePressed={isConnected}
                toggleDisabled={isAvatarChanging}
                toggleBusy={isAvatarChanging}
                toggleIcon={
                  isConnected ? (
                    <PhoneOff className="size-4" />
                  ) : (
                    <Phone className="size-4" />
                  )
                }
                onToggle={toggleAvatar}
              >
                <div
                  ref={personaContainerRef}
                  className="h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
                />
                {!isConnected ? (
                  <div className="absolute inset-0 overflow-hidden bg-canvas-avatar-surface">
                    <PersonPlaceholder />
                  </div>
                ) : null}
              </MediaTile>
            </div>

            {(avatarError || cameraError) && !minimized ? (
              <div className="grid gap-2 border-t border-border p-3 sm:px-6">
                {avatarError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{avatarError}</AlertDescription>
                  </Alert>
                ) : null}
                {cameraError ? (
                  <Alert>
                    <CameraOff className="size-4" />
                    <AlertDescription>{cameraError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </div>

          {!minimized ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="pointer-events-none absolute bottom-0 left-0 z-30 size-6 touch-none cursor-nesw-resize rounded-none rounded-tr-md bg-card/85 p-0 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
              aria-label="Resize video window"
              {...resizeHandlers}
            >
              <MoveDiagonal className="size-3" />
            </Button>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function MediaTile({
  className,
  sectionLabel,
  name,
  toggleLabel,
  togglePressed,
  toggleDisabled,
  toggleBusy,
  toggleIcon,
  onToggle,
  children
}: {
  className?: string;
  sectionLabel: string;
  name: string;
  toggleLabel: string;
  togglePressed: boolean;
  toggleDisabled: boolean;
  toggleBusy: boolean;
  toggleIcon: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "aspect-square h-full max-h-full w-auto max-w-full overflow-hidden rounded-xl border bg-muted/40",
        className
      )}
      aria-label={sectionLabel}
    >
      <div className="relative h-full w-full overflow-hidden bg-canvas-avatar-surface">
        {children}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
              aria-label={toggleLabel}
              aria-pressed={togglePressed}
              disabled={toggleDisabled}
              onClick={onToggle}
            >
              {toggleBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                toggleIcon
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{toggleLabel}</TooltipContent>
        </Tooltip>
        <div className="absolute bottom-2 left-8 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
          {name}
        </div>
      </div>
    </section>
  );
}

function PersonPlaceholder() {
  const maskImage = `url("${personSharpUrl}")`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-muted-foreground/70"
      style={{
        WebkitMaskImage: maskImage,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "cover",
        maskImage,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "cover"
      }}
    />
  );
}
