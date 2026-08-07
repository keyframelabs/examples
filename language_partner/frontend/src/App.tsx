import { lazy, Suspense, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { ScenarioLanding } from "@/components/ScenarioLanding";
import { SummaryRecommendations } from "@/components/SummaryRecommendations";
import {
  createSession,
  getScenarios,
  type Feedback,
  type LearnerTurn,
  type LiveSessionResponse,
  type Scenario,
  type SessionSummary
} from "@/lib/api";
import { GUIDED_MODE, type ConversationModeId } from "@/lib/conversationMode";
import { primeFeedbackAudio } from "@/lib/feedbackAudio";

const loadLiveSession = () => import("@/components/LiveSession");
const LiveSession = lazy(loadLiveSession);
const preloadLiveSession = () => void loadLiveSession();

type Page =
  | { name: "landing" }
  | {
      name: "live";
      scenarioTitle: string;
      sessionRequest: Promise<LiveSessionResponse>;
    }
  | { name: "summary"; summary: SessionSummary };

type ReviewedTurn = LearnerTurn & { feedback: Feedback };

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-foreground px-5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45";
const reportLabelClass =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase print:text-[8pt]";

export function App() {
  const [page, setPage] = useState<Page>({ name: "landing" });
  const [catalog, setCatalog] = useState<Scenario[] | Error | null>(null);
  const [mode, setMode] = useState<ConversationModeId>(GUIDED_MODE);

  useEffect(() => {
    const controller = new AbortController();
    getScenarios(controller.signal)
      .then((scenarios) => setCatalog(scenarios))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setCatalog(reason instanceof Error ? reason : new Error("Could not load scenarios."));
        }
      });
    return () => controller.abort();
  }, []);

  if (page.name === "summary") {
    return (
      <SummaryPage
        catalog={catalog}
        summary={page.summary}
        onRetry={() => begin({ scenarioId: page.summary.scenarioId, title: page.summary.scenarioTitle })}
        onStart={begin}
      />
    );
  }

  if (page.name === "live") {
    return (
      <Suspense fallback={<PageShell contentClassName="grid place-items-center text-muted-foreground">Opening your conversation…</PageShell>}>
        <LiveSession
          initialMode={mode}
          scenarioTitle={page.scenarioTitle}
          sessionRequest={page.sessionRequest}
          onComplete={(summary) => setPage({ name: "summary", summary })}
          onModeChange={setMode}
          onStartupFailure={() => setPage({ name: "landing" })}
        />
      </Suspense>
    );
  }

  function begin(scenario: Pick<Scenario, "scenarioId" | "title">) {
    primeFeedbackAudio();
    const sessionRequest = createSession(scenario.scenarioId);
    void sessionRequest.catch(() => undefined);
    setPage({ name: "live", scenarioTitle: scenario.title, sessionRequest });
  }

  return (
    <ScenarioLanding
      catalog={catalog}
      mode={mode}
      onModeChange={setMode}
      onPrepare={preloadLiveSession}
      onStart={begin}
    />
  );
}

function SummaryPage({
  catalog,
  summary,
  onRetry,
  onStart
}: {
  catalog: Scenario[] | Error | null;
  summary: SessionSummary;
  onRetry: () => void;
  onStart: (scenario: Scenario) => void;
}) {
  const reviewedTurns = summary.learnerTurns.filter((turn): turn is ReviewedTurn => turn.feedback !== null);
  const corrections = reviewedTurns.filter((turn) => turn.feedback.feedback === "Needs Improvement");
  const conversationNotes = reviewedTurns.filter((turn) => turn.feedback.feedback === "That wasn't nice.");
  const unreviewedCount = summary.learnerTurns.length - reviewedTurns.length;

  return (
    <PageShell
      className="print:min-h-0 print:bg-white print:p-0 print:text-[10pt]"
      contentClassName="px-5 py-8 sm:px-8 sm:py-10 print:min-h-0 print:max-w-none print:border-0 print:bg-white print:p-0"
    >
      <header className="flex flex-col items-start justify-between gap-4 border-b border-foreground pb-5 sm:flex-row print:pb-3">
        <div>
          <h1 className="mb-2 max-w-3xl font-heading text-4xl leading-none tracking-tight sm:text-5xl print:text-[24pt]">
            {summary.scenarioTitle}
          </h1>
        </div>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:flex-nowrap print:hidden">
          <button className={`${buttonClass} flex-1 bg-card sm:flex-none`} onClick={() => window.print()}>Print</button>
          <button className={`${buttonClass} flex-1 bg-primary text-primary-foreground sm:flex-none`} onClick={onRetry}>Retry</button>
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start print:mt-3 print:block">
        <div className="min-w-0">
          <section className="grid gap-3 print:max-w-none print:gap-2" aria-labelledby="practice-heading">
            <h2 id="practice-heading" className="font-heading text-2xl leading-none print:text-[14pt]">
              {corrections.length ? "Practice these phrases" : "Lesson feedback"}
            </h2>
            {corrections.length ? corrections.map((turn) => (
              <article className="break-inside-avoid rounded-lg border border-foreground bg-card p-4 print:rounded-none print:p-3" key={turn.turnId}>
                <FeedbackLine label="You said">{turn.text}</FeedbackLine>
                <FeedbackLine label="Try"><strong lang="es">{turn.feedback.suggestionSpanish}</strong></FeedbackLine>
                <FeedbackLine label="Meaning">{turn.feedback.suggestionEnglish}</FeedbackLine>
                <FeedbackLine label="Why">{turn.feedback.reason}</FeedbackLine>
              </article>
            )) : (
              <p className="rounded-lg border border-foreground bg-card p-4 text-sm print:rounded-none print:p-3 print:text-[9pt]">
                {summary.learnerTurns.length ? "No language corrections were needed in the reviewed turns." : "There is no feedback to review."}
              </p>
            )}
            {unreviewedCount ? <p className="text-xs text-muted-foreground">{unreviewedCount} learner {unreviewedCount === 1 ? "turn was" : "turns were"} not reviewed.</p> : null}
          </section>

          {conversationNotes.length ? (
            <section className="mt-6 grid gap-3 print:mt-3 print:gap-2" aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="font-heading text-2xl leading-none print:text-[14pt]">Conversation notes</h2>
              {conversationNotes.map((turn) => (
                <article className="rounded-lg border border-destructive p-4 print:rounded-none print:p-3" key={turn.turnId}>
                  <p className="mb-2" lang="es">{turn.text}</p>
                  <p className="m-0 text-sm text-muted-foreground print:text-[9pt]">{turn.feedback.reason}</p>
                </article>
              ))}
            </section>
          ) : null}
        </div>

        <SummaryRecommendations catalog={catalog} currentScenarioId={summary.scenarioId} onStart={onStart} />
      </div>
    </PageShell>
  );
}

function FeedbackLine({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mb-3 grid gap-1 text-sm leading-relaxed last:mb-0 print:mb-2 print:gap-0.5 print:text-[9pt]">
      <span className={reportLabelClass}>{label}</span>
      {children}
    </p>
  );
}
