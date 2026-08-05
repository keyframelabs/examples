import { PersonaView, type TranscriptEntry as PersonaTranscriptEntry } from "@keyframelabs/elements";
import { useEffect, useRef, useState } from "react";

import {
  endSession,
  submitTurn,
  type LiveSessionResponse,
  type SessionSummary,
  type TranscriptEntry,
  type TurnFeedback
} from "@/lib/api";

type Props = {
  scenarioTitle: string;
  startup: {
    cameraRequest: Promise<MediaStream>;
    liveSessionRequest: Promise<LiveSessionResponse>;
  };
  onComplete: (summary: SessionSummary) => void;
  onStartupFailure: () => void;
};

const WRAP_UP_CONTEXT =
  "Bring the role-play to a natural close in the next exchange. Do not mention timing or elapsed time.";

export default function LiveSession({ scenarioTitle, startup, onComplete, onStartupFailure }: Props) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const viewRef = useRef<PersonaView | null>(null);
  const sessionRef = useRef<LiveSessionResponse | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const evaluationRef = useRef(Promise.resolve());
  const finishRef = useRef<Promise<void> | null>(null);
  const expectedDisconnectRef = useRef(false);
  const wrapUpRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const turnRef = useRef(0);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TurnFeedback | null>(null);
  const [ending, setEnding] = useState(false);
  const [startupFailed, setStartupFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void connect();
    return () => {
      mountedRef.current = false;
      release();
    };
  }, []);

  function stop(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function release() {
    if (wrapUpRef.current) clearTimeout(wrapUpRef.current);
    stop(streamRef.current);
    streamRef.current = null;
    void startup.cameraRequest.then(stop).catch(() => undefined);
    expectedDisconnectRef.current = true;
    viewRef.current?.disconnect();
    viewRef.current = null;
  }

  function fail(reason: Error) {
    if (mountedRef.current) {
      setStatus("Connection error");
      setError(reason.message);
    }
    void finish(true);
  }

  async function connect() {
    void startup.cameraRequest.then(
      (stream) => {
        if (!mountedRef.current || finishRef.current) return stop(stream);
        streamRef.current = stream;
        if (!videoRef.current) return stop(stream);
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      },
      () => {
        if (mountedRef.current) setCameraMessage("Camera preview is unavailable. You can continue with voice.");
      }
    );

    let session: LiveSessionResponse;
    try {
      session = await startup.liveSessionRequest;
      sessionRef.current = session;
    } catch (reason) {
      release();
      if (mountedRef.current) {
        setStatus("Could not start");
        setStartupFailed(true);
        setError(reason instanceof Error ? reason.message : "Session provisioning failed.");
      }
      return;
    }
    if (!mountedRef.current || finishRef.current) return;
    if (!avatarRef.current) return fail(new Error("Avatar view is unavailable."));

    const seen = new WeakSet<object>();
    const view = new PersonaView({
      container: avatarRef.current,
      sessionDetails: session.sessionDetails,
      voiceAgentDetails: session.voiceAgentDetails,
      dynamicVariables: session.voiceAgentDetails.dynamic_variables,
      videoFit: "cover",
      onStateChange: (next) => {
        if (mountedRef.current) {
          setStatus(
            next === "connected" ? "Connected" :
            next === "connecting" ? "Connecting…" :
            next === "error" ? "Connection error" : "Disconnected"
          );
        }
        if (next === "connected" && !wrapUpRef.current) {
          wrapUpRef.current = setTimeout(() => view.sendContext(WRAP_UP_CONTEXT), 90_000);
        }
        if (next === "error") fail(new Error("Avatar connection failed."));
      },
      onConversationStart: ({ conversationId }) => {
        if (mountedRef.current && conversationId) setStatus("Conversation live");
      },
      onTranscript: (entry: PersonaTranscriptEntry) => {
        if (seen.has(entry)) return;
        seen.add(entry);
        const text = entry.text.trim();
        if (!text) return;
        const turn = { role: entry.role, text } as TranscriptEntry;
        transcriptRef.current.push(turn);
        if (turn.role !== "user") return;
        const turnId = ++turnRef.current;
        const transcript = [...transcriptRef.current];
        evaluationRef.current = evaluationRef.current.then(async () => {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              const result = await submitTurn(session.sessionId, turnId, turn, transcript);
              if (mountedRef.current) setFeedback(result);
              return;
            } catch (reason) {
              if (mountedRef.current) {
                setError(reason instanceof Error ? reason.message : "Turn evaluation failed.");
              }
            }
          }
        });
      },
      onDisconnect: () => {
        if (!expectedDisconnectRef.current) void finish(false);
      },
      onError: fail
    });
    viewRef.current = view;
    try {
      await view.connect();
    } catch (reason) {
      fail(reason instanceof Error ? reason : new Error("Avatar connection failed."));
    }
  }

  function finish(disconnect: boolean): Promise<void> {
    if (finishRef.current) return finishRef.current;
    if (mountedRef.current) setEnding(true);
    if (wrapUpRef.current) clearTimeout(wrapUpRef.current);
    stop(streamRef.current);
    streamRef.current = null;
    if (disconnect && viewRef.current) {
      expectedDisconnectRef.current = true;
      viewRef.current.disconnect();
      viewRef.current = null;
    }
    const task = (async () => {
      await evaluationRef.current;
      const session = sessionRef.current ?? await startup.liveSessionRequest;
      const summary = await endSession(session.sessionId, transcriptRef.current);
      if (mountedRef.current) onComplete(summary);
    })().catch((reason: unknown) => {
      if (finishRef.current === task) finishRef.current = null;
      if (mountedRef.current) {
        setEnding(false);
        setError(reason instanceof Error ? reason.message : "Could not end the session.");
      }
    });
    finishRef.current = task;
    return task;
  }

  const feedbackClass = feedback?.feedback === "Needs Improvement"
    ? "improvement"
    : feedback?.feedback === "That wasn't nice." ? "safety" : "success";

  return (
    <main className="live shell">
      <header className="live__header">
        <div><p className="eyebrow">{scenarioTitle}</p><h1>Talk with Lyra</h1></div>
        <div className="live__status"><span />{status}</div>
      </header>
      <section className="video-grid" aria-label="Conversation video">
        <div className="video-panel"><video ref={videoRef} muted playsInline aria-label="Your camera" /><span>You</span></div>
        <div className="video-panel video-panel--avatar"><div ref={avatarRef} className="avatar-container" aria-label="Lyra avatar" /><span>Lyra</span></div>
      </section>
      {cameraMessage ? <p className="camera-message" role="status">{cameraMessage}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className={`card feedback-card${feedback ? "" : " feedback-card--empty"}`} aria-live="polite">
        {feedback ? (
          <>
            <div className="feedback-card__heading">
              <p className="eyebrow">Latest turn</p>
              <span className={`feedback-label feedback-label--${feedbackClass}`}>{feedback.feedback}</span>
            </div>
            <p className="translation"><span>What you said</span>{feedback.inputEnglish}</p>
            {feedback.suggestionSpanish ? (
              <div className="suggestion">
                <p><span>Try this</span>{feedback.suggestionSpanish}</p>
                <p><span>In English</span>{feedback.suggestionEnglish}</p>
              </div>
            ) : null}
            <p className="reason">{feedback.reason}</p>
          </>
        ) : (
          <><p className="eyebrow">Live feedback</p><p>Your latest turn will appear here once you start speaking.</p></>
        )}
      </section>
      <button className="outline" onClick={startupFailed ? onStartupFailure : () => void finish(true)} disabled={ending}>
        {startupFailed ? "Back to situations" : ending ? "Preparing summary…" : "End call"}
      </button>
    </main>
  );
}
