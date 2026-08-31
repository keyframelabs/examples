import { lazy, Suspense, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { ScenarioLanding } from "@/components/ScenarioLanding";
import { SummaryRecommendations } from "@/components/SummaryRecommendations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
          <Button
            className="h-auto min-h-11 flex-1 border-foreground bg-card px-5 font-semibold transition-opacity hover:bg-card hover:text-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 disabled:opacity-45 sm:flex-none"
            onClick={() => window.print()}
            variant="outline"
          >Print</Button>
          <Button
            className="h-auto min-h-11 flex-1 border border-foreground px-5 font-semibold transition-opacity hover:bg-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 disabled:opacity-45 sm:flex-none"
            onClick={onRetry}
          >Retry</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start print:mt-3 print:block">
        <div className="min-w-0">
          <section className="grid gap-3 print:max-w-none print:gap-2" aria-labelledby="practice-heading">
            <h2 id="practice-heading" className="font-heading text-2xl leading-none print:text-[14pt]">
              {corrections.length ? "Practice these phrases" : "Lesson feedback"}
            </h2>
            {corrections.length ? corrections.map((turn) => (
              <Card asChild className="block break-inside-avoid gap-0 rounded-lg border-foreground p-4 shadow-none print:rounded-none print:p-3" key={turn.turnId}>
                <article>
                  <FeedbackLine label="You said">{turn.text}</FeedbackLine>
                  <FeedbackLine label="Try"><strong lang="es">{turn.feedback.suggestionSpanish}</strong></FeedbackLine>
                  <FeedbackLine label="Meaning">{turn.feedback.suggestionEnglish}</FeedbackLine>
                  <FeedbackLine label="Why">{turn.feedback.reason}</FeedbackLine>
                </article>
              </Card>
            )) : (
              <Card asChild className="block gap-0 rounded-lg border-foreground p-4 text-sm shadow-none print:rounded-none print:p-3 print:text-[9pt]">
                <p>{summary.learnerTurns.length ? "No language corrections were needed in the reviewed turns." : "There is no feedback to review."}</p>
              </Card>
            )}
            {unreviewedCount ? <p className="text-xs text-muted-foreground">{unreviewedCount} learner {unreviewedCount === 1 ? "turn was" : "turns were"} not reviewed.</p> : null}
          </section>

          {conversationNotes.length ? (
            <section className="mt-6 grid gap-3 print:mt-3 print:gap-2" aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="font-heading text-2xl leading-none print:text-[14pt]">Conversation notes</h2>
              {conversationNotes.map((turn) => (
                <Card asChild className="block gap-0 rounded-lg border-destructive bg-transparent p-4 shadow-none print:rounded-none print:p-3" key={turn.turnId}>
                  <article>
                    <p className="mb-2" lang="es">{turn.text}</p>
                    <p className="m-0 text-sm text-muted-foreground print:text-[9pt]">{turn.feedback.reason}</p>
                  </article>
                </Card>
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
