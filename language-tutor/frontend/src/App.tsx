import { lazy, Suspense, useEffect, useState } from "react";

import {
  createSession,
  getScenarios,
  type LiveSessionResponse,
  type Scenario,
  type SessionSummary
} from "@/lib/api";

const LiveSession = lazy(() => import("@/components/LiveSession"));

type Page =
  | { name: "landing" }
  | {
      name: "live";
      scenario: Scenario;
      startup: {
        cameraRequest: Promise<MediaStream>;
        liveSessionRequest: Promise<LiveSessionResponse>;
      };
    }
  | { name: "summary"; summary: SessionSummary };

export function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>({ name: "landing" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getScenarios(controller.signal)
      .then((catalog) => {
        setScenarios(catalog);
        setSelectedId(catalog[0]?.scenarioId ?? null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not load scenarios.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (page.name === "summary") {
    const feedback = new Map(page.summary.feedback.map((item) => [item.turnId, item]));
    let learnerTurn = 0;
    return (
      <main className="summary shell">
        <header className="summary__header">
          <div>
            <p className="eyebrow">Conversation complete</p>
            <h1>{page.summary.scenario.title}</h1>
            <p>Your transcript and focused suggestions are ready to review.</p>
          </div>
          <div className="summary__actions no-print">
            <button className="outline" onClick={() => window.print()}>Print</button>
            <button onClick={() => setPage({ name: "landing" })}>Start over</button>
          </div>
        </header>
        <section className="summary__turns" aria-label="Conversation transcript">
          {page.summary.transcript.map((entry, index) => {
            if (entry.role === "user") learnerTurn += 1;
            const turnFeedback = entry.role === "user" ? feedback.get(learnerTurn) : undefined;
            return (
              <article className={`card summary-turn summary-turn--${entry.role}`} key={index}>
                <p className="eyebrow">{entry.role === "user" ? "You" : "Lyra"}</p>
                <p className="summary-turn__spanish" lang="es">{entry.text}</p>
                {turnFeedback ? (
                  <div className="summary-turn__feedback">
                    <strong>{turnFeedback.feedback}</strong>
                    <p><span>English</span>{turnFeedback.inputEnglish}</p>
                    {turnFeedback.suggestionSpanish ? (
                      <>
                        <p><span>Try instead</span><span lang="es">{turnFeedback.suggestionSpanish}</span></p>
                        <p><span>Translation</span>{turnFeedback.suggestionEnglish}</p>
                      </>
                    ) : null}
                    <p className="reason">{turnFeedback.reason}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </main>
    );
  }

  if (page.name === "live") {
    return (
      <Suspense fallback={<main className="shell loading-session">Opening your conversation…</main>}>
        <LiveSession
          scenarioTitle={page.scenario.title}
          startup={page.startup}
          onComplete={(summary) => setPage({ name: "summary", summary })}
          onStartupFailure={() => setPage({ name: "landing" })}
        />
      </Suspense>
    );
  }

  function begin() {
    const scenario = scenarios.find((item) => item.scenarioId === selectedId);
    if (!scenario) return;
    setError(null);
    const cameraRequest = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      : Promise.reject(new Error("Camera access is unavailable in this browser."));
    const liveSessionRequest = createSession(scenario.scenarioId);
    void cameraRequest.catch(() => undefined);
    void liveSessionRequest.catch(() => undefined);
    setPage({ name: "live", scenario, startup: { cameraRequest, liveSessionRequest } });
  }

  return (
    <main className="landing shell">
      <header className="brand" aria-label="Habla Spanish tutor">
        <span className="brand__mark">H</span><span>Habla</span>
      </header>
      <div className="landing__hero">
        <section className="landing__intro">
          <p className="eyebrow">A 90-second Spanish practice</p>
          <h1>Choose a situation.<br />Start speaking.</h1>
          <p className="lede">Practice a useful conversation with Lyra, then get focused bilingual feedback.</p>
        </section>
        <figure className="persona-preview">
          <img
            src="https://storage-public.keyframelabs.com/personas/b6dad089-2dd4-4012-9f6c-53b8aec8d4f5/cover.jpeg"
            alt="Lyra, your Spanish conversation partner"
          />
          <figcaption>Meet Lyra</figcaption>
        </figure>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {loading ? (
        <div className="card loading-card">Loading situations…</div>
      ) : (
        <div className="scenario-list" aria-label="Practice situations">
          {scenarios.map((scenario) => {
            const selected = scenario.scenarioId === selectedId;
            return (
              <button
                className={`scenario-card${selected ? " scenario-card--selected" : ""}`}
                key={scenario.scenarioId}
                onClick={() => setSelectedId(scenario.scenarioId)}
                aria-pressed={selected}
              >
                <img src={scenario.imageUrl} alt="" />
                <span className="scenario-card__body">
                  <span className="scenario-card__title">{scenario.title}{selected ? <span aria-label="Selected">✓</span> : null}</span>
                  <span>{scenario.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button className="primary" onClick={begin} disabled={!selectedId || loading}>Begin conversation</button>
      <p className="permission-note">You’ll be asked for camera and microphone access.</p>
    </main>
  );
}
