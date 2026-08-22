import { memo, useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import {
  BilingualText,
  currentWordHighlightRange,
  useSegmentSelection,
  type SegmentSelection
} from "@/components/BilingualText";
import { ModeSwitch } from "@/components/ModeSwitch";
import { PageShell } from "@/components/PageShell";
import { Switch } from "@/components/ui/switch";
import {
  useLiveSession,
  type GuidedCoach,
  type ConversationMessage
} from "@/hooks/useLiveSession";
import type { LiveSessionResponse, SessionSummary, SuggestedResponse, TurnFeedback } from "@/lib/api";
import type { ConversationModeId } from "@/lib/conversationMode";

const panelActionClass = "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-xs hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45";
const noteClass = "rounded-2xl border border-border bg-card px-4 py-3 text-base text-card-foreground shadow-xs";
const suggestionNoteClass = "rounded-2xl border border-border bg-card px-4 py-3 text-base text-card-foreground shadow-xs";

function formatSessionTime(milliseconds: number) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function LiveSession({
  initialMode,
  scenarioTitle,
  sessionRequest,
  onComplete,
  onModeChange,
  onStartupFailure
}: {
  initialMode: ConversationModeId;
  scenarioTitle: string;
  sessionRequest: Promise<LiveSessionResponse>;
  onComplete: (summary: SessionSummary) => void;
  onModeChange: (mode: ConversationModeId) => void;
  onStartupFailure: () => void;
}) {
  const session = useLiveSession({ initialMode, sessionRequest, onComplete });
  const sessionTime = formatSessionTime(session.sessionTimeRemainingMs);

  function changeMode(mode: ConversationModeId) {
    if (session.setMode(mode)) onModeChange(mode);
  }

  return (
    <PageShell contentClassName="flex flex-col">
      <div className="flex flex-1 flex-col px-5 pb-8 pt-20 sm:px-8 sm:pb-10 sm:pt-24 lg:pt-28">
        <PowerMeter multiplier={session.multiplier} progress={session.streakProgress} />
        <PowerConfetti celebration={session.powerCelebrations} />

        <section className="relative z-10 mx-auto mt-7 w-full max-w-3xl" aria-label="Conversation with Caspian">
          <div className="relative mx-auto aspect-square w-full max-w-96 overflow-hidden rounded-xl border border-border bg-foreground shadow-sm">
            <div ref={session.avatarRef} className="avatar-container relative z-[1] h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" aria-label="Caspian avatar" />
            {!session.avatarConnected && <div className="absolute inset-0 z-[2] grid place-items-center bg-foreground text-primary-foreground">Connecting…</div>}
            <span
              aria-label={`Conversation time remaining ${sessionTime}`}
              className="absolute left-2 top-2 z-10 rounded-md bg-black/65 px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-white shadow-sm backdrop-blur-sm"
              role="timer"
            >
              {sessionTime}
            </span>
            <button
              className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md bg-black/65 text-white shadow-sm backdrop-blur-sm hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
              aria-label={session.startupFailed ? "Back to situations" : session.ending ? "Ending conversation" : "End conversation"}
              title={session.startupFailed ? "Back to situations" : "End conversation"}
              disabled={session.ending}
              onClick={session.startupFailed ? onStartupFailure : session.finish}
              type="button"
            >
              {session.ending ? "…" : "×"}
            </button>
            <span className="absolute bottom-3 left-3 z-10 rounded-md bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">Caspian</span>
          </div>

          <MessagePanel
            coach={session.guidedCoach}
            feedback={session.feedback}
            feedbackCanFade={session.feedbackCanFade}
            guidedMode={session.guidedMode}
            messages={session.latestMessages}
            mode={session.mode}
            onClearFeedback={session.clearFeedback}
            onModeChange={changeMode}
            onRetry={session.retryGuidedAsr}
            title={scenarioTitle}
          />
        </section>

        {session.error && <p className="mx-auto mt-5 w-full max-w-3xl rounded-lg border border-destructive/30 bg-card px-4 py-3 text-base text-destructive shadow-xs" role="alert">{session.error}</p>}
      </div>
    </PageShell>
  );
}

function MessagePanel({
  coach,
  feedback,
  feedbackCanFade,
  guidedMode,
  messages,
  mode,
  onClearFeedback,
  onModeChange,
  onRetry,
  title
}: {
  coach: GuidedCoach;
  feedback: TurnFeedback | null;
  feedbackCanFade: boolean;
  guidedMode: boolean;
  messages: ConversationMessage[];
  mode: ConversationModeId;
  onClearFeedback: (turnId: number) => void;
  onModeChange: (mode: ConversationModeId) => void;
  onRetry: () => void;
  title: string;
}) {
  const [showEnglish, setShowEnglish] = useState(true);
  const [storedSelection, setSegmentSelection] = useSegmentSelection();
  const selectedMessage = storedSelection?.ownerId.startsWith("message-")
    ? messages.find((message) => `message-${message.id}` === storedSelection.ownerId)
    : null;
  const segmentSelection = storedSelection?.ownerId === "guided-coach"
    ? coach.suggestion?.segments[storedSelection.index] ? storedSelection : null
    : selectedMessage?.segments?.[storedSelection?.index ?? -1] ? storedSelection : null;

  function setEnglishVisible(visible: boolean) {
    setSegmentSelection(null);
    setShowEnglish(visible);
  }

  return (
    <section
      className="relative mt-5 min-h-72 w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-border bg-secondary px-4 pb-4 pt-4 shadow-sm sm:px-6"
      aria-label="Latest conversation messages"
    >
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3 sm:gap-4">
        <h1 className="min-w-0 flex-1 font-heading text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
        <div className="ml-auto flex min-h-9 shrink-0 items-center gap-2 rounded-md bg-secondary px-1 text-sm font-semibold text-foreground">
          <label htmlFor="english-translation-switch">English</label>
          <Switch
            aria-label="Show English translations"
            checked={showEnglish}
            disabled={!messages.length && !coach.suggestion}
            id="english-translation-switch"
            onCheckedChange={setEnglishVisible}
          />
        </div>
      </header>

      <div className="mt-4 grid min-h-32 content-start gap-3" aria-live="polite" aria-relevant="additions text">
        {messages.length ? messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onSelectionChange={setSegmentSelection}
            selection={segmentSelection}
            showEnglish={showEnglish}
          />
        )) : (
          <p className="self-center text-center text-base text-muted-foreground">Messages will appear when the conversation begins.</p>
        )}
        {guidedMode ? (
          <GuidedCoachNote
            coach={coach}
            onSelectionChange={setSegmentSelection}
            selection={segmentSelection}
            showEnglish={showEnglish}
          />
        ) : (
          <FeedbackNote
            canFade={feedbackCanFade}
            feedback={feedback}
            onClear={onClearFeedback}
          />
        )}
      </div>

      <footer className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
        <ModeSwitch id="live-guided-mode-switch" mode={mode} onChange={onModeChange} />
        {guidedMode && (
          <button
            aria-label="Retry guided response"
            className={panelActionClass}
            disabled={coach.suggestionStatus === "loading" || coach.asrStatus === "sending" || coach.asrStatus === "waiting"}
            onClick={onRetry}
            title="Clear the recognized words and listen again"
            type="button"
          >
            Retry
          </button>
        )}
      </footer>
    </section>
  );
}

function MessageBubble({
  message,
  onSelectionChange,
  selection,
  showEnglish
}: {
  message: ConversationMessage;
  onSelectionChange: (selection: SegmentSelection | null) => void;
  selection: SegmentSelection | null;
  showEnglish: boolean;
}) {
  const fromLearner = message.role === "user";
  const bilingualSegments = message.translationStatus === "ready" && message.translation
    ? message.segments
    : null;
  return (
    <article
      aria-label={fromLearner ? "Your message" : "Caspian message"}
      className={`flex ${fromLearner ? "justify-end" : "justify-start"}`}
    >
      <div className={`min-w-0 max-w-[85%] overflow-hidden rounded-[1.35rem] px-4 py-2.5 shadow-xs sm:max-w-[78%] ${fromLearner
        ? "rounded-br-md bg-message-user text-message-user-foreground"
        : "rounded-bl-md border border-border bg-message-avatar text-foreground"
        }`}>
        {bilingualSegments ? (
          <BilingualText
            englishClassName={`mt-2 border-t pt-2 text-base leading-relaxed ${fromLearner
              ? "border-white/25 text-white/80"
              : "border-border text-muted-foreground"
              }`}
            highlightedCharacters={fromLearner ? undefined : message.highlightedCharacters}
            onSelectionChange={onSelectionChange}
            ownerId={`message-${message.id}`}
            segments={bilingualSegments}
            selection={selection}
            showEnglish={showEnglish}
            spanishClassName="text-left text-lg leading-relaxed"
          />
        ) : fromLearner ? (
          <p className="text-left text-lg leading-relaxed" lang="es">{message.text}</p>
        ) : (
          <KaraokeTranscript
            highlightedCharacters={message.highlightedCharacters}
            text={message.text}
          />
        )}
        {!bilingualSegments && showEnglish && (
          <p className={`mt-2 border-t pt-2 text-base leading-relaxed ${fromLearner
            ? "border-white/25 text-white/80"
            : "border-border text-muted-foreground"
            }`}>
            {message.translationStatus === "ready" && message.translation}
            {message.translationStatus === "loading" && "Translation is loading…"}
            {message.translationStatus === "error" && "Translation is unavailable."}
          </p>
        )}
      </div>
    </article>
  );
}

function GuidedCoachNote({
  coach,
  onSelectionChange,
  selection,
  showEnglish
}: {
  coach: GuidedCoach;
  onSelectionChange: (selection: SegmentSelection | null) => void;
  selection: SegmentSelection | null;
  showEnglish: boolean;
}) {
  if (coach.suggestionStatus === "idle") return null;
  if (coach.suggestionStatus === "loading") {
    return (
      <aside className={`ml-auto w-fit ${noteClass}`} aria-label="Response suggestion is loading" aria-live="polite">
        <TypingIndicator />
      </aside>
    );
  }
  if (coach.suggestionStatus === "error") {
    return <aside className={`ml-auto w-fit ${noteClass}`} role="alert">Response suggestion is unavailable. Retry.</aside>;
  }
  return (
    <aside className={`ml-auto w-fit min-w-0 max-w-[85%] overflow-hidden ${suggestionNoteClass}`} aria-label="Guided response" aria-live="polite">
      {coach.suggestion && (
        <BilingualText
          englishClassName="mt-2 border-t border-border pt-2 text-base leading-relaxed text-muted-foreground"
          highlightedCharacters={suggestionHighlightBoundary(coach.suggestion, coach.matchedWordCount)}
          karaokeComplete={coach.speechComplete}
          karaokeVariant="guided-script"
          onSelectionChange={onSelectionChange}
          ownerId="guided-coach"
          segments={coach.suggestion.segments}
          selection={selection}
          showEnglish={showEnglish}
          spanishClassName="text-left text-lg leading-relaxed"
        />
      )}
    </aside>
  );
}

function TypingIndicator() {
  return (
    <span aria-hidden="true" className="inline-flex h-4 items-center gap-1 px-0.5">
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
    </span>
  );
}

function FeedbackNote({
  feedback,
  canFade,
  onClear
}: {
  feedback: TurnFeedback | null;
  canFade: boolean;
  onClear: (turnId: number) => void;
}) {
  if (!feedback || feedback.feedback === "Great Job!") return null;
  return (
    <aside
      aria-label="Feedback for your response"
      className={`ml-auto w-fit max-w-[85%] feedback-bubble${canFade ? " feedback-bubble--ready-to-fade" : ""}`}
      key={feedback.turnId}
      onAnimationEnd={(event) => event.animationName === "feedback-bubble-out" && onClear(feedback.turnId)}
    >
      {feedback.feedback === "Needs Improvement" ? (
        <div className={`${suggestionNoteClass} grid gap-1.5 leading-relaxed`}>
          {feedback.suggestionSpanish && <strong className="text-lg font-medium" lang="es">{feedback.suggestionSpanish}</strong>}
          {feedback.suggestionEnglish && <p className="text-accent-foreground/75">{feedback.suggestionEnglish}</p>}
        </div>
      ) : (
        <div className={`${noteClass} border-destructive/30 bg-destructive text-destructive-foreground`}>
          <strong>{feedback.feedback}</strong><span className="ml-2">{feedback.reason}</span>
        </div>
      )}
    </aside>
  );
}

function KaraokeTranscript({ text, highlightedCharacters }: { text: string; highlightedCharacters: number }) {
  const range = currentWordHighlightRange(text, highlightedCharacters);
  return (
    <p aria-label={text} className="text-left text-lg leading-relaxed" lang="es">
      <span aria-hidden="true">
        {range ? (
          <>
            {text.slice(0, range.start)}
            <mark className="rounded-sm bg-accent px-0.5 text-accent-foreground">{text.slice(range.start, range.end)}</mark>
            {text.slice(range.end)}
          </>
        ) : text}
      </span>
    </p>
  );
}

function suggestionHighlightBoundary(suggestion: SuggestedResponse, matchedWordCount: number): number {
  const words = Array.from(suggestion.response.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu));
  const nextWord = words[Math.max(0, matchedWordCount)];
  return matchedWordCount <= 0
    ? 0
    : matchedWordCount >= words.length
      ? suggestion.response.length
      : nextWord?.index ?? suggestion.response.length;
}

function PowerMeter({
  multiplier,
  progress
}: {
  multiplier: number;
  progress: number;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl" aria-label="Conversation reward status">
      <div className="flex items-center justify-center gap-4">
        <div className="grid w-52 grid-cols-3 gap-1.5 rounded-xl border border-border bg-card p-2" role="progressbar" aria-label={`${progress} of 30 power points`} aria-valuemin={0} aria-valuemax={30} aria-valuenow={progress}>
          {[10, 20, 30].map((threshold) => (
            <span aria-hidden="true" className={`power-meter-segment${progress >= threshold ? " power-meter-segment--lit" : ""}`} key={threshold} />
          ))}
        </div>
        <strong
          aria-label={`Multiplier x${multiplier}`}
          className="inline-block min-w-12 font-bold leading-none"
          key={multiplier}
          style={{ fontSize: `${1.25 + (Math.min(multiplier, 5) - 1) * 0.2}rem` }}
        >
          <span className="multiplier-bump">
            <span className={multiplier >= 2 ? "multiplier-shake" : ""}>×{multiplier}</span>
          </span>
        </strong>
      </div>
    </section>
  );
}

const PowerConfetti = memo(function PowerConfetti({ celebration }: { celebration: number }) {
  if (!celebration) return null;
  const props = {
    colors: ["#00c805", "#111111", "#d4af37"],
    duration: 3000,
    force: 1,
    height: "120vh",
    particleCount: 90,
    particleSize: 9,
    width: 900,
    zIndex: 5
  };
  return (
    <div aria-hidden="true" className="power-confetti pointer-events-none" key={celebration}>
      <div className="fixed bottom-0 left-[4vw]"><ConfettiExplosion {...props} /></div>
      <div className="fixed bottom-0 right-[4vw]"><ConfettiExplosion {...props} /></div>
    </div>
  );
});
