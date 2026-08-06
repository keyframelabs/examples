import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronRight,
  GripHorizontal,
  Loader2,
  Maximize2,
  Minus,
  MoveDiagonal,
  Phone,
  PhoneOff
} from "lucide-react";
import { useEffect } from "react";

import personSharpUrl from "@/assets/person-sharp.svg";
import {
  useInterviewMediaSession,
  type InterviewStartup
} from "@/components/avatar/useInterviewMediaSession";
import { useFloatingPanel } from "@/components/avatar/useFloatingPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { InterviewPacket } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CanvasSyncStatus } from "@/utils/avatar/canvasContextSync";

type InterviewStage = "introduction" | "canvas";

export type { InterviewStartup } from "@/components/avatar/useInterviewMediaSession";

type FloatingAvatarWindowProps = {
  canvasText: string;
  packet: InterviewPacket;
  startup: InterviewStartup;
  stage: InterviewStage;
  onEnterCanvas: () => void;
  onReturnToSelection: () => void;
  onCanvasSyncStatusChange?: (status: CanvasSyncStatus) => void;
};

export function FloatingAvatarWindow({
  canvasText,
  packet,
  startup,
  stage,
  onEnterCanvas,
  onReturnToSelection,
  onCanvasSyncStatusChange
}: FloatingAvatarWindowProps) {
  const {
    panelRef,
    panelSize,
    position,
    minimized,
    setMinimized,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerUp,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizeKeyDown
  } = useFloatingPanel(stage);
  const {
    personaContainerRef,
    userVideoRef,
    isConnecting,
    isConnected,
    isEndingCall,
    hasEndedCall,
    avatarError,
    cameraError,
    cameraStatus,
    events,
    canvasSyncStatus,
    joinInterview,
    toggleCamera,
    toggleLyra
  } = useInterviewMediaSession({
    canvasText,
    packet,
    startup,
    onVisibleError: () => setMinimized(false)
  });
  const showConnectionLog = shouldShowConnectionLog();
  const isCameraOn = cameraStatus === "ready";
  const isCameraChanging = cameraStatus === "requesting";
  const cameraToggleLabel = isCameraChanging
    ? "Turning on camera"
    : isCameraOn
      ? "Turn off camera"
      : "Turn on camera";
  const isLyraChanging = isConnecting || isEndingCall;
  const lyraToggleLabel = isEndingCall
    ? "Turning off Lyra"
    : isConnecting
      ? "Turning on Lyra"
      : isConnected
        ? "Turn off Lyra"
        : "Turn on Lyra";

  useEffect(() => {
    onCanvasSyncStatusChange?.(canvasSyncStatus);
  }, [canvasSyncStatus, onCanvasSyncStatusChange]);

  const intro = stage === "introduction";

  return (
    <>
      {!intro ? (
        <Card className="fixed right-4 top-4 z-50 bg-card/95 p-1 backdrop-blur-sm">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
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
          </TooltipProvider>
        </Card>
      ) : null}

      <div
        className={cn(
          "fixed z-40",
          intro
            ? "inset-0 overflow-y-auto bg-canvas-paper px-4 sm:px-6 lg:px-8"
            : "left-0 top-0"
        )}
        style={
          intro
            ? undefined
            : { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
        }
      >
        <div
          className={cn(
            intro &&
            "mx-auto grid min-h-full w-full max-w-7xl grid-rows-[1fr_auto_1fr] border-x border-border/50 px-3 py-4 sm:px-5 sm:py-5 lg:px-8"
          )}
        >
          {intro ? (
            <div className="mb-3 translate-y-0 self-end text-center sm:-translate-y-15">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Ace your next system design interview
              </h1>
              <p className="mx-auto mt-3 max-w-2xl font-sans text-sm leading-6 text-muted-foreground sm:text-base">
                Practice {packet.title} with Lyra
              </p>
              {!isConnected && !avatarError ? (
                <p
                  className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground"
                  role="status"
                >
                  Allow camera and microphone access when your browser asks.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={onReturnToSelection}
              >
                Choose a different packet
              </Button>
            </div>
          ) : null}

          <Card
            key="interview-media-card"
            ref={panelRef}
            style={
              !intro
                ? {
                    width: `${panelSize.width}px`,
                    height: minimized ? undefined : `${panelSize.height}px`
                  }
                : undefined
            }
            className={cn(
              "group relative flex flex-col overflow-hidden bg-card text-card-foreground shadow-xl",
              intro
                ? "mx-auto w-full max-w-[814px] translate-y-0 rounded-xl border-border/80 sm:translate-y-8"
                : minimized
                  ? "max-w-[calc(100vw-24px)] rounded-lg"
                  : "w-[min(404px,calc(100vw-24px))] max-w-[min(404px,calc(100vw-24px))] max-h-[calc(100vh-68px)] rounded-lg"
            )}
          >
            {!intro ? (
              <div
                className="flex h-9 cursor-move touch-none items-center border-b border-border bg-card px-2"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={handleHeaderPointerUp}
              >
                <GripHorizontal className="size-4 text-muted-foreground" />
                <div className="flex-1" />
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={
                          minimized
                            ? "Restore video window"
                            : "Minimize video window"
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
                </TooltipProvider>
              </div>
            ) : null}

            <div
              className={cn(
                !intro &&
                  !minimized &&
                  "flex min-h-0 flex-1 flex-col overflow-hidden"
              )}
            >
            <div
              className={cn(
                "grid items-center justify-items-center",
                intro
                  ? "gap-2 p-2 sm:grid-cols-2 sm:p-3"
                  : "min-h-0 flex-1 grid-rows-2 gap-1 p-1",
                minimized && !intro && "hidden"
              )}
            >
              <section
                className={cn(
                  "overflow-hidden rounded-xl border bg-muted/40",
                  intro
                    ? "order-1 w-full max-w-[386px]"
                    : "order-2 h-full max-h-full aspect-square w-auto max-w-full"
                )}
                aria-label="Your camera preview"
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-foreground",
                    intro ? "aspect-square" : "h-full w-full"
                  )}
                >
                  <video
                    ref={userVideoRef}
                    className={cn(
                      "h-full w-full scale-x-[-1] object-cover",
                      cameraStatus !== "ready" && "invisible"
                    )}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Your live camera preview"
                  />
                  {cameraStatus !== "ready" ? (
                    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas-avatar-surface">
                      <PersonPlaceholder />
                      <div
                        className="relative z-10 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground shadow-lg"
                        role="status"
                      >
                        {cameraStatus === "requesting" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {cameraStatus === "requesting"
                          ? "Waiting for camera permission"
                          : cameraStatus === "unavailable"
                            ? "Camera unavailable"
                            : cameraStatus === "off"
                              ? "Camera off"
                              : "Preparing camera"}
                      </div>
                    </div>
                  ) : null}
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                          aria-label={cameraToggleLabel}
                          aria-pressed={isCameraOn}
                          disabled={isCameraChanging}
                          onClick={toggleCamera}
                        >
                          {isCameraChanging ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isCameraOn ? (
                            <CameraOff className="size-4" />
                          ) : (
                            <Camera className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {cameraToggleLabel}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div
                    className={cn(
                      "absolute bottom-2 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm",
                      intro ? "left-2" : "left-8"
                    )}
                  >
                    You
                  </div>
                </div>
              </section>

              <section
                className={cn(
                  "overflow-hidden rounded-xl border bg-muted/40",
                  intro
                    ? "order-2 w-full max-w-[386px]"
                    : "order-1 h-full max-h-full aspect-square w-auto max-w-full"
                )}
                aria-label="Lyra video"
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-canvas-avatar-surface",
                    intro ? "aspect-square" : "h-full w-full"
                  )}
                >
                  <div
                    ref={personaContainerRef}
                    className="h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
                  />
                  {!isConnected ? (
                    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas-avatar-surface">
                      <PersonPlaceholder />
                      <div
                        className="relative z-10 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground shadow-lg"
                        role="status"
                      >
                        {isConnecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {avatarError
                          ? "Lyra is unavailable"
                          : isConnecting
                            ? "Lyra is joining"
                            : hasEndedCall
                              ? "Call ended"
                              : "Preparing Lyra"}
                      </div>
                    </div>
                  ) : null}
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          className="absolute right-2 top-2 z-10 bg-black/65 text-white hover:bg-black/80 hover:text-white"
                          aria-label={lyraToggleLabel}
                          aria-pressed={isConnected}
                          disabled={isLyraChanging}
                          onClick={toggleLyra}
                        >
                          {isLyraChanging ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isConnected ? (
                            <PhoneOff className="size-4" />
                          ) : (
                            <Phone className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {lyraToggleLabel}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div
                    className={cn(
                      "absolute bottom-2 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm",
                      intro ? "left-2" : "left-8"
                    )}
                  >
                    Lyra
                  </div>
                </div>
              </section>
            </div>

            {intro ? (
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  className="w-full font-semibold"
                  onClick={
                    isConnected
                      ? onEnterCanvas
                      : () => void joinInterview()
                  }
                  disabled={
                    !isConnected &&
                    (!avatarError ||
                      isConnecting ||
                      cameraStatus === "requesting")
                  }
                >
                  {!isConnected && !avatarError ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {isConnected
                    ? "Open design canvas"
                    : avatarError
                      ? "Retry interview"
                      : "Starting interview"}
                  {isConnected ? <ChevronRight className="size-4" /> : null}
                </Button>
              </div>
            ) : null}

            {(avatarError || cameraError) && (!minimized || intro) ? (
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

            {showConnectionLog && events.length > 0 && (!minimized || intro) ? (
              <div className="border-t border-border p-3 sm:px-6">
                <ScrollArea className="h-28 rounded-md border bg-muted text-xs text-muted-foreground">
                  <div className="p-2">
                    {events.map((event) => (
                      <div key={event}>{event}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
            </div>

            {!intro && !minimized ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="pointer-events-none absolute bottom-0 left-0 z-30 size-6 touch-none cursor-nesw-resize rounded-none rounded-tr-md bg-card/85 p-0 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                aria-label="Resize video window"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                onKeyDown={handleResizeKeyDown}
              >
                <MoveDiagonal className="size-3" />
              </Button>
            ) : null}
          </Card>
          {intro ? <div aria-hidden="true" /> : null}
        </div>
      </div>
    </>
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

function shouldShowConnectionLog(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  return params.has("cli") || window.location.hash.toLowerCase().includes("cli");
}
