import { lazy, Suspense, useState } from "react";

import type { InterviewStartup } from "@/components/avatar/useInterviewMediaSession";
import { InterviewPacketLanding } from "@/components/interview/InterviewPacketLanding";
import { createLiveSession, type InterviewPacket } from "@/lib/api";
import { requestUserCamera } from "@/utils/interview/userCamera";

// The interview chunk is loaded before starting a session so a network
// failure surfaces as a retryable error here instead of a broken Suspense
// mount. The cache resets on failure because browsers may cache a rejected
// dynamic import for the lifetime of the page.
let interviewSessionModulePromise: Promise<
  typeof import("@/components/interview/InterviewSession")
> | null = null;

function loadInterviewSession() {
  interviewSessionModulePromise ??= import(
    "@/components/interview/InterviewSession"
  ).catch((error) => {
    interviewSessionModulePromise = null;
    throw error;
  });
  return interviewSessionModulePromise;
}

const InterviewSession = lazy(loadInterviewSession);

type ActiveInterview = {
  packet: InterviewPacket;
  startup: InterviewStartup;
};

export function App() {
  const [activeInterview, setActiveInterview] =
    useState<ActiveInterview | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function startInterview(packet: InterviewPacket) {
    if (isStarting) return;
    setIsStarting(true);
    setStartError(null);

    try {
      await loadInterviewSession();
    } catch {
      setIsStarting(false);
      setStartError(
        "Could not load the interview workspace. Check your connection and try again."
      );
      return;
    }

    const startup = {
      cameraRequest: requestUserCamera(),
      liveSessionRequest: createLiveSession(packet.packetId)
    };
    void startup.cameraRequest.catch(() => undefined);
    void startup.liveSessionRequest.catch(() => undefined);
    setActiveInterview({ packet, startup });
    setIsStarting(false);
  }

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      {activeInterview ? (
        <Suspense fallback={<InterviewSessionLoading />}>
          <InterviewSession
            packet={activeInterview.packet}
            startup={activeInterview.startup}
            onExit={() => setActiveInterview(null)}
          />
        </Suspense>
      ) : isStarting ? (
        <InterviewSessionLoading />
      ) : (
        <InterviewPacketLanding onStartInterview={startInterview} />
      )}
      {startError ? (
        <p
          className="fixed bottom-4 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-destructive/40 bg-card px-4 py-3 text-center text-sm text-destructive shadow-lg"
          role="alert"
        >
          {startError}
        </p>
      ) : null}
    </main>
  );
}

function InterviewSessionLoading() {
  return (
    <div
      className="grid h-full place-items-center text-sm text-muted-foreground"
      role="status"
    >
      Starting interview…
    </div>
  );
}
