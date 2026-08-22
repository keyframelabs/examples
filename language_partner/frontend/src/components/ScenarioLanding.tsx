import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import caspianUrl from "@/assets/caspian.jpg";
import { ModeSwitch } from "@/components/ModeSwitch";
import { PageShell } from "@/components/PageShell";
import { ScenarioCard } from "@/components/ScenarioCard";
import type { Scenario } from "@/lib/api";
import type { ConversationModeId } from "@/lib/conversationMode";

const controlClass = "inline-flex size-8 items-center justify-center rounded-md border border-foreground bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-35";
const edgeClass = "shrink-0 basis-[calc((100%-92vw)/2)] sm:basis-[calc((100%-36rem)/2)] lg:basis-[calc((100%-40rem)/2)]";

export function ScenarioLanding({
  catalog,
  mode,
  onModeChange,
  onPrepare,
  onStart
}: {
  catalog: Scenario[] | Error | null;
  mode: ConversationModeId;
  onModeChange: (mode: ConversationModeId) => void;
  onPrepare: () => void;
  onStart: (scenario: Scenario) => void;
}) {
  const scenarios = Array.isArray(catalog) ? catalog : [];

  return (
    <PageShell className="h-screen overflow-y-auto" contentClassName="flex min-h-full flex-col justify-center py-6">
      <header className="mx-auto mb-6 max-w-5xl px-4 text-center">
        <div className="mx-auto mb-3 size-36 overflow-hidden rounded-3xl border-2 border-foreground bg-muted shadow-md sm:size-44">
          <img className="h-full w-full object-cover" src={caspianUrl} alt="Caspian, your Spanish conversation partner" />
        </div>
        <h1 className="text-balance font-heading text-4xl leading-none tracking-tight sm:text-5xl">Practice Spanish with Caspian</h1>
      </header>
      <div className="mb-6 w-full border-t border-border/50" aria-hidden="true" />
      {catalog === null ? (
        <div className="mx-auto grid min-h-72 w-full max-w-2xl place-items-center border bg-card p-8" role="status">
          <span className="size-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground motion-reduce:animate-none" aria-hidden="true" />
        </div>
      ) : catalog instanceof Error ? (
        <div className="mx-auto w-full max-w-2xl border bg-card p-6 text-center">
          <p className="text-sm text-destructive" role="alert">{catalog.message}</p>
          <button className="mt-4 min-h-11 w-full border border-foreground px-5 text-sm font-semibold" onClick={() => window.location.reload()}>Try again</button>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="mx-auto w-full max-w-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No practice situations yet.</div>
      ) : (
        <ScenarioCarousel
          mode={mode}
          scenarios={scenarios}
          onModeChange={onModeChange}
          onPrepare={onPrepare}
          onStart={onStart}
        />
      )}
    </PageShell>
  );
}

function ScenarioCarousel({
  mode,
  scenarios,
  onModeChange,
  onPrepare,
  onStart
}: {
  mode: ConversationModeId;
  scenarios: Scenario[];
  onModeChange: (mode: ConversationModeId) => void;
  onPrepare: () => void;
  onStart: (scenario: Scenario) => void;
}) {
  const cards = useRef<Array<HTMLButtonElement | null>>([]);
  const slides = useRef<Array<HTMLLIElement | null>>([]);
  const track = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const movable = scenarios.length > 1;
  const looped = movable ? [scenarios.at(-1)!, ...scenarios, scenarios[0]] : scenarios;
  const first = movable ? 1 : 0;
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const [playing, setPlaying] = useState(
    () => movable && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  function scrollToSlide(index: number, smooth = true) {
    const slide = slides.current[index];
    if (slide && track.current) {
      track.current.scrollTo({
        left: slide.offsetLeft - (track.current.clientWidth - slide.clientWidth) / 2,
        behavior: smooth ? "smooth" : "auto"
      });
    }
  }

  function nearestSlide() {
    if (!track.current) return first;
    const center = track.current.scrollLeft + track.current.clientWidth / 2;
    const distances = slides.current.map((slide) =>
      Math.abs((slide?.offsetLeft ?? 0) + (slide?.clientWidth ?? 0) / 2 - center)
    );
    return distances.indexOf(Math.min(...distances));
  }

  const scenarioIndex = (index: number) => (index - first + scenarios.length) % scenarios.length;

  function setCurrent(index: number) {
    if (selectedRef.current === index) return;
    selectedRef.current = index;
    setSelected(index);
  }

  function goTo(index: number, focus = false) {
    const current = selectedRef.current;
    const slide = movable && current === 0 && index === scenarios.length - 1
      ? 0
      : movable && current === scenarios.length - 1 && index === 0
        ? looped.length - 1
        : index + first;
    setCurrent(index);
    scrollToSlide(slide);
    if (focus) cards.current[index]?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => scrollToSlide(first, false), [first]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  function syncSelected() {
    const index = nearestSlide();
    setCurrent(scenarioIndex(index));
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const settled = nearestSlide();
      if (movable && settled === 0) scrollToSlide(scenarios.length, false);
      if (movable && settled === looped.length - 1) scrollToSlide(first, false);
    }, 100);
  }

  useEffect(() => {
    if (!playing || !movable) return;
    const timer = window.setInterval(() => {
      goTo((selectedRef.current + 1) % scenarios.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [movable, playing, scenarios.length]);

  const stop = () => setPlaying(false);

  function select(index: number, focus = false) {
    stop();
    goTo(index, focus);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? scenarios.length - 1
      : ["ArrowRight", "ArrowDown"].includes(event.key) ? (index + 1) % scenarios.length
        : ["ArrowLeft", "ArrowUp"].includes(event.key) ? (index - 1 + scenarios.length) % scenarios.length : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <section aria-label="Practice situations">
      <div className="mb-3 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="mx-auto sm:mx-0">
          <ModeSwitch id="landing-guided-mode-switch" mode={mode} onChange={onModeChange} />
        </div>
        <div className="flex justify-center gap-2" aria-label="Carousel controls">
          <button className={controlClass} aria-label="Previous situation" disabled={!movable} onClick={() => select((selected - 1 + scenarios.length) % scenarios.length)}>←</button>
          <button className={controlClass} aria-label={playing ? "Pause carousel" : "Play carousel"} disabled={!movable} onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button>
          <button className={controlClass} aria-label="Next situation" disabled={!movable} onClick={() => select((selected + 1) % scenarios.length)}>→</button>
        </div>
      </div>
      <div
        ref={track}
        className="snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label="Practice situations"
        onFocusCapture={stop}
        onPointerDown={stop}
        onScroll={syncSelected}
        onWheel={stop}
      >
        <ul className="flex pb-4">
          <li ref={(element) => element?.setAttribute("inert", "")} className={edgeClass} aria-hidden="true" />
          {looped.map((scenario, slideIndex) => {
            const sentinel = movable && (slideIndex === 0 || slideIndex === looped.length - 1);
            const index = scenarioIndex(slideIndex);
            const card = <ScenarioCard scenario={scenario} selected={index === selected} />;
            return (
              <li
                ref={(element) => {
                  slides.current[slideIndex] = element;
                  element?.toggleAttribute("inert", sentinel);
                }}
                className={`shrink-0 basis-[92vw] snap-center sm:basis-[36rem] lg:basis-[40rem] ${slideIndex ? "ml-4" : ""}`}
                key={`${scenario.scenarioId}-${slideIndex}`}
                aria-hidden={sentinel || undefined}
              >
                {sentinel ? <div className="h-full">{card}</div> : (
                  <button
                    ref={(element) => { cards.current[index] = element; }}
                    className="h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    role="radio"
                    aria-checked={index === selected}
                    aria-label={`Slide ${index + 1} of ${scenarios.length}`}
                    tabIndex={index === selected ? 0 : -1}
                    onClick={() => select(index)}
                    onFocus={() => {
                      stop();
                      if (selectedRef.current !== index) goTo(index);
                    }}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    {card}
                  </button>
                )}
              </li>
            );
          })}
          <li ref={(element) => element?.setAttribute("inert", "")} className={edgeClass} aria-hidden="true" />
        </ul>
      </div>
      <div className="mt-3 flex justify-center px-4">
        <button className="inline-flex min-h-11 w-full max-w-sm items-center justify-center bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto sm:min-w-64" onFocus={onPrepare} onMouseEnter={onPrepare} onClick={() => onStart(scenarios[selected])}>Begin conversation</button>
      </div>
    </section>
  );
}
