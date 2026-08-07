import personSharpUrl from "@/assets/person-sharp.svg";
import { PageShell } from "@/components/PageShell";
import { useLiveSession } from "@/hooks/useLiveSession";
import type { LiveSessionResponse, SessionSummary, TurnFeedback } from "@/lib/api";

const alertClass = "relative min-h-28 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-sm";
const panelLabelClass = "mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase";

export default function LiveSession({
  scenarioTitle,
  sessionRequest,
  onComplete,
  onStartupFailure
}: {
  scenarioTitle: string;
  sessionRequest: Promise<LiveSessionResponse>;
  onComplete: (summary: SessionSummary) => void;
  onStartupFailure: () => void;
}) {
  const session = useLiveSession({ sessionRequest, onComplete });
  const transcript = session.avatarTranscript;

  return (
    <PageShell contentClassName="flex flex-col">
      <div className="flex flex-1 flex-col px-5 pb-8 pt-56 sm:px-8 sm:pb-10 sm:pt-60 lg:pt-64">
        <h1 className="mx-auto mb-5 w-full max-w-5xl text-center font-serif text-3xl font-medium tracking-tight sm:text-4xl">{scenarioTitle}</h1>
        <PowerMeter level={session.powerLevel} />

        <section className="mx-auto mt-7 grid w-full max-w-[60rem] items-start gap-6 md:grid-cols-2 md:gap-12 lg:gap-24" aria-label="Conversation video feeds">
          <article className="mx-auto w-full max-w-[27rem]">
            <div className="relative mx-auto aspect-square w-full max-w-96 overflow-hidden rounded-xl border border-border bg-foreground shadow-sm">
              <video
                ref={session.userVideoRef}
                aria-label="Your camera preview"
                autoPlay
                className={`h-full w-full -scale-x-100 object-cover transition-opacity ${session.cameraReady ? "opacity-100" : "opacity-0"}`}
                muted
                playsInline
              />
              {!session.cameraReady && <PersonPlaceholder />}
              <span className="absolute bottom-3 left-3 z-10 rounded-md bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">You</span>
              {!session.cameraReady && (
                <p className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-md bg-black/65 px-3 py-2 text-center text-xs text-white backdrop-blur-sm" role={session.cameraError ? "alert" : undefined}>
                  {session.cameraError ?? "Starting camera…"}
                </p>
              )}
            </div>
            <FeedbackPanel
              feedback={session.feedback}
              canFade={session.feedbackCanFade}
              onClear={session.clearFeedback}
            />
          </article>

          <article className="mx-auto w-full max-w-[27rem]">
            <div className="relative mx-auto aspect-square w-full max-w-96 overflow-hidden rounded-xl border border-border bg-foreground shadow-sm">
              <div ref={session.avatarRef} className="avatar-container relative z-[1] h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" aria-label="Caspian avatar" />
              {!session.avatarConnected && <PersonPlaceholder />}
              <button
                className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md bg-black/65 text-white shadow-sm backdrop-blur-sm hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                aria-label={session.startupFailed ? "Back to situations" : session.ending ? "Ending conversation" : "End conversation"}
                title={session.startupFailed ? "Back to situations" : "End conversation"}
                disabled={session.ending}
                onClick={session.startupFailed ? onStartupFailure : session.finish}
              >
                {session.ending ? (
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" />
                ) : (
                  <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" />
                    <path d="M22 2 2 22" />
                    <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" />
                  </svg>
                )}
              </button>
              <span className="absolute bottom-3 left-3 z-10 rounded-md bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">Caspian</span>
              <button
                className="absolute bottom-3 right-3 z-10 inline-flex min-h-8 items-center justify-center rounded-md bg-black/65 px-3 text-xs font-semibold text-white shadow-sm backdrop-blur-sm hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
                aria-pressed={transcript?.showTranslation ?? false}
                disabled={!transcript}
                onClick={session.toggleAvatarTranslation}
                type="button"
              >
                {transcript?.showTranslation ? "Hide English" : "Show English"}
              </button>
            </div>

            <section className={`${alertClass} mt-4 min-h-28`} aria-label="Caspian transcript" aria-live="polite">
              <p className={panelLabelClass}>Caspian said</p>
              {transcript ? (
                <>
                  <p className="text-base leading-relaxed" lang="es">{transcript.text}</p>
                  {transcript.showTranslation && (
                    <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
                      {transcript.translationStatus === "ready" && transcript.translation}
                      {transcript.translationStatus === "loading" && "Translation is loading…"}
                      {transcript.translationStatus === "error" && "Translation is unavailable."}
                    </p>
                  )}
                </>
              ) : (
                null
              )}
            </section>
          </article>
        </section>

        {session.error && <p className="mx-auto mt-5 w-full max-w-5xl rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-xs" role="alert">{session.error}</p>}
      </div>
    </PageShell>
  );
}

function PersonPlaceholder() {
  return (
    <div className="absolute inset-0 z-[2] bg-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-primary-foreground/70"
        style={{
          WebkitMask: `url("${personSharpUrl}") center / cover no-repeat`,
          mask: `url("${personSharpUrl}") center / cover no-repeat`
        }}
      />
    </div>
  );
}

function PowerMeter({ level }: { level: number }) {
  return (
    <section className="mx-auto w-full max-w-xl" aria-label="Conversation power level">
      <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold tracking-wider uppercase">
        <svg aria-hidden="true" className="size-4 text-accent-foreground" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.2 2 5 13.1h6.1L10.8 22 19 10.9h-6.1L13.2 2Z" />
        </svg>
        <span>Power level</span>
        <span className="text-muted-foreground">{level}/8</span>
      </div>
      <div
        className="grid grid-cols-8 gap-1.5 rounded-xl border border-border bg-card p-2 shadow-xs"
        role="progressbar"
        aria-label={`${level} of 8 power sections filled`}
        aria-valuemin={0}
        aria-valuemax={8}
        aria-valuenow={level}
      >
        {Array.from({ length: 8 }, (_, index) => (
          <span
            aria-hidden="true"
            className={`h-3 rounded-sm border transition-colors duration-300 ${index < level ? "border-accent-foreground/50 bg-accent-foreground" : "border-border bg-secondary"}`}
            key={index}
          />
        ))}
      </div>
    </section>
  );
}

function FeedbackPanel({
  feedback,
  canFade,
  onClear
}: {
  feedback: TurnFeedback | null;
  canFade: boolean;
  onClear: (turnId: number) => void;
}) {
  return (
    <section className="mt-4 min-h-28" aria-label="Suggestions for your response" aria-live="polite">
      {!feedback ? (
        <div className={alertClass}>
          <p className={panelLabelClass}>Your feedback</p>
        </div>
      ) : (
        <div
          key={feedback.turnId}
          className={`feedback-bubble${canFade ? " feedback-bubble--ready-to-fade" : ""}`}
          onAnimationEnd={(event) => event.animationName === "feedback-bubble-out" && onClear(feedback.turnId)}
        >
          {feedback.feedback === "Great Job!" ? (
            <div className={`${alertClass} border-accent bg-accent text-accent-foreground`}>
              <p className={`${panelLabelClass} text-accent-foreground/70`}>Your feedback</p>
              <p className="font-semibold">Great Job! Power added.</p>
            </div>
          ) : feedback.feedback === "Needs Improvement" ? (
            <div className={alertClass}>
              <p className={panelLabelClass}>Your feedback</p>
              <div className="grid gap-4 text-sm leading-relaxed">
                {feedback.suggestionSpanish && <p className="grid gap-2"><span className="w-fit rounded-md bg-accent px-2 py-1 text-xs font-bold tracking-wider text-accent-foreground uppercase">Try this</span><strong className="text-base font-medium" lang="es">{feedback.suggestionSpanish}</strong></p>}
                {feedback.suggestionEnglish && <p className="text-muted-foreground">{feedback.suggestionEnglish}</p>}
                <p className="border-t border-border pt-3 text-muted-foreground">{feedback.reason}</p>
              </div>
            </div>
          ) : (
            <div className={`${alertClass} border-destructive/30 bg-destructive text-destructive-foreground`}>
              <p className={`${panelLabelClass} text-destructive-foreground/75`}>Your feedback</p>
              <strong>{feedback.feedback}</strong><span className="ml-2">{feedback.reason}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
