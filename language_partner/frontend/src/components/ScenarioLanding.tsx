import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import caspianUrl from "@/assets/caspian.jpg";
import { PageShell } from "@/components/PageShell";
import { getScenarios, type Scenario } from "@/lib/api";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
type SkillLevel = (typeof LEVELS)[number];
const controlClass = "inline-flex size-8 items-center justify-center rounded-md border border-foreground bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-35";
const allowsAutoplay = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function ScenarioLanding({
  onPrepare,
  onStart
}: {
  onPrepare: () => void;
  onStart: (scenario: Scenario) => void;
}) {
  const [catalog, setCatalog] = useState<Scenario[] | Error | null>(null);
  const [level, setLevel] = useState<SkillLevel>("Beginner");

  useEffect(() => {
    const controller = new AbortController();
    getScenarios(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setCatalog(items);
      setLevel(items[0]?.skillLevel ?? "Beginner");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setCatalog(reason instanceof Error ? reason : new Error("Could not load scenarios."));
    });
    return () => controller.abort();
  }, []);

  const scenarios = Array.isArray(catalog) ? catalog : [];
  return (
    <PageShell className="h-screen overflow-y-auto" contentClassName="flex min-h-full flex-col justify-center py-6">
      <header className="mx-auto mb-6 max-w-5xl px-4 text-center">
        <div className="mx-auto mb-3 size-36 overflow-hidden rounded-3xl border-2 border-foreground bg-muted shadow-md sm:size-44">
          <img className="h-full w-full object-cover" src={caspianUrl} alt="Caspian, your Spanish conversation partner" />
        </div>
        <h1 className="text-balance font-serif text-4xl leading-none tracking-tight sm:text-5xl">Practice Spanish with Caspian</h1>
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
          key={level}
          level={level}
          levels={new Set(scenarios.map((item) => item.skillLevel))}
          scenarios={scenarios.filter((item) => item.skillLevel === level)}
          onChangeLevel={setLevel}
          onPrepare={onPrepare}
          onStart={onStart}
        />
      )}
    </PageShell>
  );
}

function ScenarioCarousel({
  level,
  levels,
  scenarios,
  onChangeLevel,
  onPrepare,
  onStart
}: {
  level: SkillLevel;
  levels: ReadonlySet<SkillLevel>;
  scenarios: Scenario[];
  onChangeLevel: (level: SkillLevel) => void;
  onPrepare: () => void;
  onStart: (scenario: Scenario) => void;
}) {
  const movable = scenarios.length > 1;
  const slides = movable && scenarios.length < 4 ? [...scenarios, ...scenarios] : scenarios;
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(() => movable && allowsAutoplay());
  const [autoplay] = useState(() => Autoplay({ delay: 2000, playOnInit: movable && allowsAutoplay(), stopOnInteraction: true }));
  const [carouselRef, carousel] = useEmblaCarousel({ align: "center", containScroll: false, loop: movable }, [autoplay]);
  const cards = useRef<Array<HTMLButtonElement | null>>([]);
  const scenarioIndex = selected % scenarios.length;

  useEffect(() => {
    if (!carousel) return;
    const syncSlide = () => setSelected(carousel.selectedScrollSnap());
    const syncPlaying = () => setPlaying(autoplay.isPlaying());
    syncSlide();
    syncPlaying();
    carousel.on("select", syncSlide).on("autoplay:play", syncPlaying).on("autoplay:stop", syncPlaying);
    return () => {
      carousel.off("select", syncSlide).off("autoplay:play", syncPlaying).off("autoplay:stop", syncPlaying);
    };
  }, [autoplay, carousel]);

  function stop() {
    autoplay.stop();
    setPlaying(false);
  }

  function select(index: number, focus = false) {
    stop();
    carousel?.scrollTo(index);
    setSelected(index);
    if (focus) cards.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % scenarios.length,
      ArrowDown: (index + 1) % scenarios.length,
      ArrowLeft: (index - 1 + scenarios.length) % scenarios.length,
      ArrowUp: (index - 1 + scenarios.length) % scenarios.length,
      Home: 0,
      End: scenarios.length - 1
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key], true);
  }

  function move(next: boolean) {
    stop();
    next ? carousel?.scrollNext() : carousel?.scrollPrev();
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="mx-auto grid min-h-10 w-full max-w-sm grid-cols-3 bg-muted p-[3px] text-muted-foreground sm:mx-0 sm:w-auto" role="group" aria-label="Spanish skill level">
          {LEVELS.map((item) => (
            <button
              key={item}
              className={`min-w-24 px-3 py-1.5 text-sm font-medium ${item === level ? "bg-primary text-primary-foreground shadow-xs" : "hover:text-foreground"}`}
              aria-pressed={item === level}
              disabled={!levels.has(item)}
              onClick={() => onChangeLevel(item)}
            >{item}</button>
          ))}
        </div>
        <div className="flex justify-center gap-2" aria-label="Carousel controls">
          <button className={controlClass} aria-label="Previous situation" disabled={!movable} onClick={() => move(false)}>←</button>
          <button
            className={controlClass}
            aria-label={playing ? "Pause carousel" : "Play carousel"}
            disabled={!movable}
            onClick={() => {
              autoplay.isPlaying() ? autoplay.stop() : autoplay.play();
              setPlaying(autoplay.isPlaying());
            }}
          >{playing ? "Ⅱ" : "▶"}</button>
          <button className={controlClass} aria-label="Next situation" disabled={!movable} onClick={() => move(true)}>→</button>
        </div>
      </div>

      <div ref={carouselRef} className="overflow-hidden" role="radiogroup" aria-label={`${level} practice situations`} onFocusCapture={stop}>
        <div className="-ml-4 flex pb-4">
          {slides.map((scenario, index) => {
            const clone = index >= scenarios.length;
            const card = (
              <div className={`flex min-h-64 flex-col border p-5 transition-transform ${index === selected ? "-translate-y-0.5 border-foreground bg-card shadow-lg" : "border-border/80 bg-card/70 hover:border-muted-foreground"}`}>
                <div className="flex justify-end"><span className="border border-foreground bg-secondary px-2.5 py-1 text-xs font-semibold">{scenario.skillLevel}</span></div>
                <div className="flex flex-1 items-center justify-center py-4 text-center"><h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{scenario.title}</h2></div>
              </div>
            );
            return (
              <div
                className="min-w-0 shrink-0 grow-0 basis-[min(92vw,38rem)] pl-4 sm:basis-[36rem] lg:basis-[40rem]"
                key={`${scenario.scenarioId}-${index}`}
                aria-hidden={clone || undefined}
                aria-label={clone ? undefined : `Slide ${index + 1} of ${scenarios.length}`}
              >
                {clone ? (
                  <div className="h-full w-full cursor-pointer text-left" onClick={() => select(index)}>{card}</div>
                ) : (
                  <button
                    ref={(element) => { cards.current[index] = element; }}
                    className="h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    role="radio"
                    aria-checked={index === scenarioIndex}
                    tabIndex={index === scenarioIndex ? 0 : -1}
                    onFocus={() => select(index)}
                    onClick={() => select(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >{card}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex justify-center px-4">
        <button
          className="inline-flex min-h-11 w-full max-w-sm items-center justify-center bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto sm:min-w-64"
          onFocus={onPrepare}
          onMouseEnter={onPrepare}
          onClick={() => onStart(scenarios[scenarioIndex])}
        >Begin conversation</button>
      </div>
    </div>
  );
}
