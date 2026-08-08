import Autoplay from "embla-carousel-autoplay";
import { AlertCircle, Database, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from "@/components/ui/carousel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInterviewPackets, type InterviewPacket } from "@/lib/api";
import { cn } from "@/lib/utils";

const AVATAR_STILL_URL =
  "https://storage-public.keyframelabs.com/personas/b6dad089-2dd4-4012-9f6c-53b8aec8d4f5/cover.jpeg";

const SKILL_LEVELS = ["Intern", "Junior", "Senior"] as const;
type SkillLevel = (typeof SKILL_LEVELS)[number];

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; packets: InterviewPacket[] };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function InterviewPacketLanding({
  onStartInterview
}: {
  onStartInterview: (packet: InterviewPacket) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeSkillLevel, setActiveSkillLevel] =
    useState<SkillLevel>("Intern");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAutoplayPlaying, setIsAutoplayPlaying] = useState(
    () => !prefersReducedMotion()
  );
  const [autoplayPlugin] = useState(() =>
    Autoplay({
      delay: 2000,
      playOnInit: !prefersReducedMotion(),
      stopOnInteraction: true,
      stopOnMouseEnter: false
    })
  );
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const autoplayStoppedByUser = useRef(prefersReducedMotion());

  const packets = catalog.status === "ready" ? catalog.packets : [];
  const availableSkillLevels = new Set(
    packets.map((packet) => packet.skillLevel)
  );
  const visiblePackets = packets.filter(
    (packet) => packet.skillLevel === activeSkillLevel
  );

  useEffect(() => {
    const controller = new AbortController();

    setCatalog({ status: "loading" });
    getInterviewPackets(controller.signal).then(
      (loadedPackets) => {
        setCatalog({ status: "ready", packets: loadedPackets });
        setActiveSkillLevel(
          SKILL_LEVELS.find((level) =>
            loadedPackets.some((packet) => packet.skillLevel === level)
          ) ?? "Intern"
        );
        setSelectedIndex(0);
      },
      (loadError: unknown) => {
        if (controller.signal.aborted) return;
        setCatalog({
          status: "error",
          message:
            loadError instanceof Error
              ? loadError.message
              : "Could not load interview packets."
        });
      }
    );

    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (!carouselApi) return;

    const syncSelectedPacket = () => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };
    const syncAutoplay = () => {
      setIsAutoplayPlaying(autoplayPlugin.isPlaying());
    };

    syncSelectedPacket();
    carouselApi.on("select", syncSelectedPacket);
    carouselApi.on("reInit", syncSelectedPacket);
    carouselApi.on("autoplay:play", syncAutoplay);
    carouselApi.on("autoplay:stop", syncAutoplay);

    if (autoplayStoppedByUser.current) {
      autoplayPlugin.stop();
    } else {
      autoplayPlugin.play();
    }
    syncAutoplay();

    return () => {
      carouselApi.off("select", syncSelectedPacket);
      carouselApi.off("reInit", syncSelectedPacket);
      carouselApi.off("autoplay:play", syncAutoplay);
      carouselApi.off("autoplay:stop", syncAutoplay);
    };
  }, [autoplayPlugin, carouselApi]);

  const selectedPacket = visiblePackets[selectedIndex];

  function stopAutoplay() {
    autoplayStoppedByUser.current = true;
    autoplayPlugin.stop();
    setIsAutoplayPlaying(false);
  }

  function toggleAutoplay() {
    if (autoplayPlugin.isPlaying()) {
      stopAutoplay();
    } else {
      autoplayStoppedByUser.current = false;
      autoplayPlugin.play();
      setIsAutoplayPlaying(autoplayPlugin.isPlaying());
    }
  }

  function selectPacket(index: number, moveFocus = false) {
    const nextIndex = Math.max(0, Math.min(index, visiblePackets.length - 1));
    stopAutoplay();
    setSelectedIndex(nextIndex);
    carouselApi?.scrollTo(nextIndex);
    if (moveFocus) cardRefs.current[nextIndex]?.focus();
  }

  function handleCardKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) {
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(currentIndex + 1, visiblePackets.length - 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(currentIndex - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? visiblePackets.length - 1
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    selectPacket(nextIndex, true);
  }

  function changeSkillLevel(value: string) {
    const level = SKILL_LEVELS.find((skillLevel) => skillLevel === value);
    if (!level || !availableSkillLevels.has(level) || level === activeSkillLevel) {
      return;
    }
    stopAutoplay();
    setCarouselApi(undefined);
    setSelectedIndex(0);
    cardRefs.current = [];
    setActiveSkillLevel(level);
  }

  return (
    <section className="h-screen overflow-y-auto bg-canvas-paper px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col justify-center border-x border-border/50 py-6">
        <header className="mx-auto mb-6 max-w-5xl text-center">
          <div className="mx-auto mb-3 size-36 overflow-hidden rounded-3xl border-2 border-foreground bg-muted shadow-md sm:size-44">
            <img
              src={AVATAR_STILL_URL}
              alt="Lyra, your AI system design interviewer"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-balance font-serif text-4xl leading-none tracking-tight text-foreground sm:text-5xl">
            Ace your next system design interview with Lyra
          </h1>
        </header>
        <div
          className="mb-6 w-full border-t border-border/50"
          aria-hidden="true"
        />

        {catalog.status === "loading" ? (
          <Card
            className="mx-auto flex min-h-72 w-full max-w-2xl items-center justify-center p-8"
            aria-live="polite"
          >
            <div className="text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 size-7 animate-spin" />
              <p>Loading interview packets…</p>
            </div>
          </Card>
        ) : null}

        {catalog.status === "error" ? (
          <Card className="mx-auto w-full max-w-2xl p-6">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{catalog.message}</AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              Try again
            </Button>
          </Card>
        ) : null}

        {catalog.status === "ready" && packets.length === 0 ? (
          <Card className="mx-auto w-full max-w-2xl p-8 text-center">
            <Database className="mx-auto mb-3 size-7 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No interview packets yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a validated Markdown packet on the server, then refresh this
              page.
            </p>
          </Card>
        ) : null}

        {catalog.status === "ready" && packets.length > 0 ? (
          <Tabs value={activeSkillLevel} onValueChange={changeSkillLevel}>
            <Carousel
              key={activeSkillLevel}
              setApi={setCarouselApi}
              plugins={[autoplayPlugin]}
              opts={{
                align: "center",
                loop: visiblePackets.length > 1
              }}
              aria-label={`${activeSkillLevel} interview packet carousel`}
            >
              <div className="mb-3 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <TabsList
                  className="mx-auto grid w-full max-w-sm grid-cols-3 sm:mx-0 sm:w-auto"
                  aria-label="Interview experience level"
                >
                  {SKILL_LEVELS.map((skillLevel) => (
                    <TabsTrigger
                      key={skillLevel}
                      value={skillLevel}
                      disabled={!availableSkillLevels.has(skillLevel)}
                      onClick={stopAutoplay}
                    >
                      {skillLevel}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div
                  className="flex justify-center gap-2 sm:justify-end"
                  aria-label="Carousel controls"
                >
                  <CarouselPrevious
                    size="icon-sm"
                    className="static left-auto top-auto translate-y-0"
                    aria-label="Previous interview packet"
                    disabled={visiblePackets.length <= 1}
                    onClick={() => {
                      stopAutoplay();
                      carouselApi?.scrollPrev();
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    aria-label={
                      isAutoplayPlaying
                        ? "Pause interview packet autoplay"
                        : "Play interview packet autoplay"
                    }
                    disabled={visiblePackets.length <= 1}
                    onClick={toggleAutoplay}
                  >
                    {isAutoplayPlaying ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                  <CarouselNext
                    size="icon-sm"
                    className="static right-auto top-auto translate-y-0"
                    aria-label="Next interview packet"
                    disabled={visiblePackets.length <= 1}
                    onClick={() => {
                      stopAutoplay();
                      carouselApi?.scrollNext();
                    }}
                  />
                </div>
              </div>

              <TabsContent value={activeSkillLevel} className="mt-0">
                <CarouselContent
                  role="radiogroup"
                  aria-label={`${activeSkillLevel} interview packets`}
                  className="pb-4"
                >
                  {visiblePackets.map((packet, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <CarouselItem
                        key={packet.packetId}
                        className="basis-[min(92vw,38rem)] sm:basis-[36rem] lg:basis-[40rem]"
                        aria-label={`Slide ${index + 1} of ${visiblePackets.length}`}
                      >
                        <button
                          ref={(element) => {
                            cardRefs.current[index] = element;
                          }}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          className="h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => selectPacket(index)}
                          onKeyDown={(event) => handleCardKeyDown(event, index)}
                        >
                          <Card
                            className={cn(
                              "flex h-full min-h-64 flex-col gap-0 p-5 transition-[border-color,background-color,transform]",
                              isSelected
                                ? "-translate-y-0.5 border-foreground bg-card shadow-lg"
                                : "border-border/80 bg-card/70 hover:border-muted-foreground"
                            )}
                          >
                            <div className="flex items-start justify-end gap-3">
                              <Badge>{packet.skillLevel}</Badge>
                            </div>
                            <div className="flex flex-1 items-center justify-center py-4 text-center">
                              <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                                Design {packet.title}
                              </h2>
                            </div>
                          </Card>
                        </button>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </TabsContent>
            </Carousel>

            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                size="lg"
                className="w-full max-w-sm font-semibold sm:w-auto sm:min-w-64"
                disabled={!selectedPacket}
                onClick={() => selectedPacket && onStartInterview(selectedPacket)}
              >
                Begin interview
              </Button>
            </div>
          </Tabs>
        ) : null}
      </div>
    </section>
  );
}
