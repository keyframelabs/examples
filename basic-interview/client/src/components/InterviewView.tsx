import { useState } from "react";
import { Check, Copy, FileText, RefreshCcw } from "lucide-react";

import { PersonaStage } from "@/components/PersonaStage";
import { Button } from "@/components/ui/button";
import { endInterview, startLiveSession, type CreateInterviewInput } from "@/lib/api";
import type {
  ElevenLabsPromptDebug,
  FeedbackArtifact,
  InterviewCreateResponse,
  LiveSessionResponse
} from "@kfl-interview/shared";

type InterviewViewProps = {
  createdInput: CreateInterviewInput;
  createdInterview: InterviewCreateResponse;
  onBack: () => void;
  onFeedback: (artifact: FeedbackArtifact) => void;
};

export function InterviewView({ createdInput, createdInterview, onBack, onFeedback }: InterviewViewProps) {
  const [liveSession, setLiveSession] = useState<LiveSessionResponse>();
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryBlocked, setSummaryBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptDebug = liveSession?.elevenLabsPromptDebug;

  async function prepareSession(forceRefresh = false) {
    if (liveSession && !forceRefresh) {
      return liveSession;
    }

    setError(null);
    try {
      const nextSession = await startLiveSession(createdInterview.interviewId);
      setLiveSession(nextSession);
      return nextSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the live session.");
      throw err;
    }
  }

  async function handleGenerateSummary() {
    setError(null);
    setSummaryBlocked(false);
    setIsGeneratingSummary(true);
    try {
      const artifact = await endInterview(createdInterview.interviewId);
      if (!artifact.transcriptAvailable) {
        setSummaryBlocked(true);
        setError("No transcript was available for this call, so a summary cannot be generated yet.");
        return;
      }
      onFeedback(artifact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate feedback.");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 px-4 py-6 lg:px-8">
      <section className="grid gap-5 self-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Live mock interview</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {createdInput.candidateName || "Candidate"} interview workspace
            </p>
          </div>
          <div className="flex justify-start sm:justify-end">
            <Button variant="outline" onClick={onBack}>
              <RefreshCcw />
              Start over
            </Button>
          </div>
        </div>

        <PersonaStage
          liveSession={liveSession}
          onPrepareSession={prepareSession}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingSummary={isGeneratingSummary}
          summaryBlocked={summaryBlocked}
          onCallStarted={() => {
            setSummaryBlocked(false);
            setError(null);
          }}
        />

        {import.meta.env.DEV && promptDebug ? (
          <ElevenLabsPromptDebugPanel debug={promptDebug} />
        ) : null}

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ElevenLabsPromptDebugPanel({ debug }: { debug: ElevenLabsPromptDebug }) {
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const patchPayload = JSON.stringify(debug.agentUpdatePayload, null, 2);

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedTarget(label);
    window.setTimeout(() => setCopiedTarget(null), 1_500);
  }

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <details open>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" />
          ElevenLabs prompt debug
        </summary>
        <div className="mt-4 grid gap-4">
          <PromptDebugBlock
            label="First message"
            value={debug.firstMessage}
            copied={copiedTarget === "first message"}
            onCopy={() => {
              void copyValue("first message", debug.firstMessage);
            }}
          />
          <PromptDebugBlock
            label="System prompt"
            value={debug.systemPrompt}
            copied={copiedTarget === "system prompt"}
            onCopy={() => {
              void copyValue("system prompt", debug.systemPrompt);
            }}
          />
          <PromptDebugBlock
            label="Agent PATCH payload"
            value={patchPayload}
            copied={copiedTarget === "patch payload"}
            onCopy={() => {
              void copyValue("patch payload", patchPayload);
            }}
          />
        </div>
      </details>
    </section>
  );
}

function PromptDebugBlock({
  label,
  value,
  copied,
  onCopy
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h2>
        <div className="flex items-center gap-2">
          {copied ? (
            <span className="text-xs text-primary">Copied</span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            onClick={onCopy}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/35 p-3 text-xs leading-5 text-foreground">
        <code>{value}</code>
      </pre>
    </div>
  );
}
