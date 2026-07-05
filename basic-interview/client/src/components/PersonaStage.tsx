import { useEffect, useRef, useState } from "react";
import { createClient, type PersonaSession } from "@keyframelabs/sdk";
import { floatTo16BitPCM } from "@keyframelabs/elements";
import { Loader2, MessagesSquare, Mic, PhoneOff, RadioTower } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ElevenLabsRuntimeAgent, type RuntimeAgentEventMap } from "@/lib/elevenlabs-runtime-agent";
import { buildInitialContextUpdate } from "@/lib/interview-context";
import type { LiveSessionResponse } from "@kfl-interview/shared";

type PersonaStageProps = {
  liveSession?: LiveSessionResponse;
  onPrepareSession: (forceRefresh?: boolean) => Promise<LiveSessionResponse>;
  onGenerateSummary: () => void;
  isGeneratingSummary: boolean;
  summaryBlocked?: boolean;
  onCallStarted?: () => void;
};

type ActiveBridge = {
  session: PersonaSession;
  agent: ElevenLabsRuntimeAgent;
  stream: MediaStream;
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  closeState: {
    expected: boolean;
  };
};

export function PersonaStage({
  liveSession,
  onPrepareSession,
  onGenerateSummary,
  isGeneratingSummary,
  summaryBlocked,
  onCallStarted
}: PersonaStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<ActiveBridge | null>(null);
  const sessionRef = useRef<LiveSessionResponse | undefined>(liveSession);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const showConnectionLog = shouldShowConnectionLog();
  const canGenerateSummary = callEnded && !summaryBlocked && !isGeneratingSummary;

  useEffect(() => {
    sessionRef.current = liveSession;
  }, [liveSession]);

  useEffect(() => {
    return () => {
      void cleanupBridge();
    };
  }, []);

  async function connect() {
    setError(null);
    setCompletionMessage(null);
    setEvents([]);
    setCallEnded(false);
    setIsConnecting(true);
    onCallStarted?.();

    try {
      await cleanupBridge();
      const session = await onPrepareSession(true);
      sessionRef.current = session;

      const container = containerRef.current;
      if (!container) {
        throw new Error("Avatar container is not ready.");
      }

      clearContainer(container);
      const videoElement = createVideoElement();
      const audioElement = createAudioElement();
      container.appendChild(videoElement);
      container.appendChild(audioElement);

      const agent = new ElevenLabsRuntimeAgent();
      const closeState = { expected: false };
      const personaSession = createClient({
        serverUrl: session.sessionDetails.server_url,
        participantToken: session.sessionDetails.participant_token,
        agentIdentity: session.sessionDetails.agent_identity,
        onVideoTrack: (track) => {
          logEvent("Keyframe video track received");
          videoElement.srcObject = new MediaStream([track]);
          void videoElement.play().catch((err: unknown) => {
            logEvent(`Video play blocked: ${formatError(err)}`);
          });
        },
        onAudioTrack: (track) => {
          logEvent("Keyframe audio track received");
          audioElement.srcObject = new MediaStream([track]);
          void audioElement.play().catch(() => undefined);
        },
        onStateChange: (nextStatus) => {
          logEvent(`Keyframe state: ${nextStatus}`);
          setIsConnected(nextStatus === "connected");
        },
        onAgentStateChange: (nextStatus) => {
          logEvent(`Avatar playback: ${nextStatus}`);
        },
        onClose: (reason) => {
          logEvent(`Keyframe room closed: ${reason}`);
          if (closeState.expected) {
            return;
          }
          handleUnexpectedClose("keyframe", reason);
        },
        onError: (err) => {
          logEvent(`Keyframe error: ${err.message}`);
          setError(`Live interviewer error: ${err.message}`);
        }
      });

      agent.on("audio", (audio) => personaSession.sendAudio(audio));
      agent.on("turnEnd", () => {
        logEvent("ElevenLabs turn ended");
        void personaSession.endAudioTurn();
      });
      agent.on("interrupted", () => {
        logEvent("ElevenLabs interruption");
        void personaSession.endAudioTurn();
        void personaSession.interrupt();
      });
      agent.on("emotion", (emotion) => {
        void personaSession.setEmotion(emotion);
      });
      agent.on("stateChange", (nextStatus: RuntimeAgentEventMap["stateChange"]) => {
        logEvent(`ElevenLabs state: ${nextStatus}`);
      });
      agent.on("transcript", (transcript: RuntimeAgentEventMap["transcript"]) => {
        if (transcript.isFinal && transcript.text.trim()) {
          logEvent(`Transcript received: ${transcript.role}`);
        }
      });
      agent.on("closed", (closed: RuntimeAgentEventMap["closed"]) => {
        if (closeState.expected) {
          return;
        }
        const reason = formatAgentClose(closed);
        logEvent(`ElevenLabs closed: ${reason}`);
        if (isExpectedEndCall(closed)) {
          handleCompletedCall();
        } else {
          handleUnexpectedClose("elevenlabs", reason);
        }
      });

      logEvent("Connecting to Keyframe room");
      await personaSession.connect();

      logEvent("Requesting microphone");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16_000, echoCancellation: true, noiseSuppression: true }
      });
      const audioContext = new AudioContext({ sampleRate: 16_000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      bridgeRef.current = {
        session: personaSession,
        agent,
        stream,
        audioContext,
        processor,
        videoElement,
        audioElement,
        closeState
      };

      processor.onaudioprocess = (event) => {
        agent.sendAudio(floatTo16BitPCM(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);

      logEvent("Connecting to ElevenLabs");
      await agent.connect({
        agentId: session.voiceAgentDetails.agent_id ?? "",
        signedUrl: session.voiceAgentDetails.signed_url,
        inputSampleRate: 16_000,
        voiceAgentDetails: session.voiceAgentDetails
      });
      agent.sendContextUpdate(buildInitialContextUpdate(session.voiceAgentDetails.dynamic_variables));
      logEvent("Sent interview context update");

      setIsConnected(true);
      logEvent("Live avatar connected");
    } catch (err) {
      await cleanupBridge();
      setError(formatError(err));
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }

  async function endCall() {
    setError(null);
    await cleanupBridge();
    markCallEnded();
  }

  async function cleanupBridge() {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    bridge.closeState.expected = true;
    bridgeRef.current = null;
    bridge.stream.getTracks().forEach((track) => track.stop());
    bridge.processor.disconnect();
    await bridge.audioContext.close().catch(() => undefined);
    bridge.agent.close();
    await bridge.session.close().catch(() => undefined);
    bridge.videoElement.remove();
    bridge.audioElement.remove();
    setIsConnected(false);
  }

  function handleUnexpectedClose(source: "keyframe" | "elevenlabs", reason: string) {
    const label = source === "keyframe" ? "Live interviewer" : "Voice connection";
    setError(`${label} disconnected: ${reason}`);
    void cleanupBridge();
  }

  function handleCompletedCall() {
    setError(null);
    markCallEnded();
    void cleanupBridge();
  }

  function markCallEnded() {
    setCallEnded(true);
    setCompletionMessage("The call ended. Generate the summary when ready.");
  }

  function logEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setEvents((current) => [...current.slice(-7), `${timestamp} ${message}`]);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="size-4 text-primary" />
            Live interviewer
          </CardTitle>
          <CardDescription>Microphone access is requested when the interview starts.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="relative aspect-[16/10] min-h-[300px] overflow-hidden rounded-lg border bg-[#111315]">
          <div ref={containerRef} className="absolute inset-0" />
          {!isConnected ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-white/10 text-white">
                  <Mic className="size-6" />
                </div>
                <p className="text-sm font-medium text-white">Interview stage</p>
                <p className="mt-1 max-w-sm text-sm text-white/65">
                  Connect when you are ready to start the mock interview.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={connect} disabled={isConnecting || isConnected}>
            {isConnecting ? <Loader2 className="animate-spin" /> : <Mic />}
            Start interview
          </Button>
          <Button variant="outline" onClick={endCall} disabled={!isConnected && !bridgeRef.current}>
            <PhoneOff />
            End call
          </Button>
          <Button onClick={onGenerateSummary} disabled={!canGenerateSummary}>
            {isGeneratingSummary ? <Loader2 className="animate-spin" /> : <MessagesSquare />}
            Generate summary
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {completionMessage ? (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {completionMessage}
          </div>
        ) : null}

        {showConnectionLog && events.length > 0 ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Connection log</p>
            <div className="grid gap-1 text-xs text-muted-foreground">
              {events.map((event) => (
                <div key={event}>{event}</div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  return video;
}

function createAudioElement(): HTMLAudioElement {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  return audio;
}

function clearContainer(container: HTMLElement) {
  while (container.firstChild) {
    container.firstChild.remove();
  }
}

function shouldShowConnectionLog(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("cli") || window.location.hash.toLowerCase().includes("cli");
}

function formatAgentClose(closed: RuntimeAgentEventMap["closed"]): string {
  const code = closed.code ? `code ${closed.code}` : "no code";
  const reason = closed.reason?.trim() ? closed.reason : "no reason";
  return `${code}, ${reason}`;
}

function isExpectedEndCall(closed: RuntimeAgentEventMap["closed"]): boolean {
  if (closed.code === 1000 || closed.code === 1005) {
    return true;
  }

  const reason = closed.reason?.toLowerCase() ?? "";
  return reason.includes("end_call")
    || reason.includes("task completed")
    || reason.includes("call ended")
    || reason.includes("conversation ended")
    || reason.includes("completed successfully");
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "Could not connect the live avatar.";
}
