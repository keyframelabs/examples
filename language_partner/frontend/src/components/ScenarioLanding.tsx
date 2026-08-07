import { useEffect, useState } from "react";

import caspianUrl from "@/assets/caspian.jpg";
import { ModeSwitch } from "@/components/ModeSwitch";
import { PageShell } from "@/components/PageShell";
import { ScenarioCard } from "@/components/ScenarioCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi
} from "@/components/ui/carousel";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { Scenario } from "@/lib/api";
import type { ConversationModeId } from "@/lib/conversationMode";

const controlClass = "inline-flex size-8 items-center justify-center rounded-md border border-foreground bg-primary text-primary-foreground hover:bg-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 disabled:opacity-35";

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
        <Avatar className="mx-auto mb-3 size-36 rounded-3xl border-2 border-foreground bg-muted shadow-md sm:size-44">
          <AvatarImage className="object-cover" src={caspianUrl} alt="Caspian, your Spanish conversation partner" />
        </Avatar>
        <h1 className="text-balance font-heading text-4xl leading-none tracking-tight sm:text-5xl">Practice Spanish with Caspian</h1>
      </header>
      <Separator className="mb-6 bg-border/50" />
      {catalog === null ? (
        <Card className="mx-auto grid min-h-72 w-full max-w-2xl place-items-center gap-0 rounded-none p-8 py-8 shadow-none" role="status">
          <Spinner aria-hidden="true" className="size-7" />
        </Card>
      ) : catalog instanceof Error ? (
        <Card className="mx-auto w-full max-w-2xl gap-0 rounded-none p-6 py-6 text-center shadow-none">
          <Alert className="block border-0 bg-transparent p-0" variant="destructive">
            <AlertDescription className="block text-sm text-destructive">{catalog.message}</AlertDescription>
          </Alert>
          <Button className="mt-4 h-auto min-h-11 w-full rounded-none border-foreground px-5 font-semibold hover:bg-transparent focus-visible:ring-0" onClick={() => window.location.reload()} variant="outline">Try again</Button>
        </Card>
      ) : scenarios.length === 0 ? (
        <Card className="mx-auto block w-full max-w-2xl gap-0 rounded-none p-8 py-8 text-center text-sm text-muted-foreground shadow-none">No practice situations yet.</Card>
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
  const movable = scenarios.length > 1;
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(
    () => movable && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (!api) return;
    const syncSelected = () => setSelected(api.selectedScrollSnap());
    syncSelected();
    api.on("select", syncSelected);
    api.on("reInit", syncSelected);
    return () => {
      api.off("select", syncSelected);
      api.off("reInit", syncSelected);
    };
  }, [api]);

  useEffect(() => {
    if (!api || !playing || !movable) return;
    const timer = window.setInterval(() => api.scrollNext(), 5000);
    return () => window.clearInterval(timer);
  }, [api, movable, playing]);

  const stop = () => setPlaying(false);

  function select(index: number) {
    stop();
    setSelected(index);
    api?.scrollTo(index);
  }

  return (
    <section aria-label="Practice situations">
      <div className="mb-3 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="mx-auto sm:mx-0">
          <ModeSwitch id="landing-guided-mode-switch" mode={mode} onChange={onModeChange} />
        </div>
        <div className="flex justify-center gap-2" aria-label="Carousel controls">
          <Button className={controlClass} aria-label="Previous situation" disabled={!movable} onClick={() => select((selected - 1 + scenarios.length) % scenarios.length)} size="icon-sm">←</Button>
          <Button className={controlClass} aria-label={playing ? "Pause carousel" : "Play carousel"} disabled={!movable} onClick={() => setPlaying((value) => !value)} size="icon-sm">{playing ? "Ⅱ" : "▶"}</Button>
          <Button className={controlClass} aria-label="Next situation" disabled={!movable} onClick={() => select((selected + 1) % scenarios.length)} size="icon-sm">→</Button>
        </div>
      </div>
      <RadioGroup
        aria-label="Practice situations"
        className="block"
        onValueChange={(scenarioId) => select(scenarios.findIndex((scenario) => scenario.scenarioId === scenarioId))}
        value={scenarios[selected]?.scenarioId}
      >
        <Carousel
          aria-label="Practice situations carousel"
          onFocusCapture={stop}
          onPointerDown={stop}
          onWheel={stop}
          opts={{ align: "center", loop: movable }}
          setApi={setApi}
        >
          <CarouselContent className="ml-0 gap-4 pb-4">
            {scenarios.map((scenario, index) => (
              <CarouselItem className="basis-[92vw] pl-0 sm:basis-[36rem] lg:basis-[40rem]" key={scenario.scenarioId}>
                <RadioGroupItem
                  aria-label={`Slide ${index + 1} of ${scenarios.length}`}
                  className="aspect-auto h-full w-full rounded-none border-0 text-left shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0"
                  indicator={false}
                  onFocus={() => {
                    stop();
                    api?.scrollTo(index);
                  }}
                  value={scenario.scenarioId}
                >
                  <ScenarioCard scenario={scenario} selected={index === selected} />
                </RadioGroupItem>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </RadioGroup>
      <div className="mt-3 flex justify-center px-4">
        <Button
          className="h-auto min-h-11 w-full max-w-sm rounded-none px-8 font-semibold shadow-xs hover:bg-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 sm:w-auto sm:min-w-64"
          onClick={() => onStart(scenarios[selected])}
          onFocus={onPrepare}
          onMouseEnter={onPrepare}
        >
          Begin conversation
        </Button>
      </div>
    </section>
  );
}
