import Autoplay from "embla-carousel-autoplay";
import {
  AlertCircle,
  Database,
  Loader2,
  Pause,
  Play
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";

import {
  getAvailableSkillLevels,
  getInitialSkillLevel,
  SKILL_LEVELS,
  type SkillLevel
} from "@/components/interview/interviewPacketSelection";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { getInterviewPackets, type InterviewPacket } from "@/lib/api";
import { cn } from "@/lib/utils";

const LYRA_STILL_URL =
  "https://storage-public.keyframelabs.com/personas/b6dad089-2dd4-4012-9f6c-53b8aec8d4f5/cover.jpeg";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function shouldStartAutoplay() {
  return typeof window === "undefined"
    || typeof window.matchMedia !== "function"
    || !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

type InterviewPacketLandingProps = {
  onStartInterview: (packet: InterviewPacket) => void;
};

export function InterviewPacketLanding({
  onStartInterview
}: InterviewPacketLandingProps) {
  const [packets, setPackets] = useState<InterviewPacket[]>([]);
  const [activeSkillLevel, setActiveSkillLevel] =
    useState<SkillLevel>("Intern");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [isAutoplayPlaying, setIsAutoplayPlaying] = useState(
    shouldStartAutoplay
  );
  const [autoplayPlugin] = useState(() =>
    Autoplay({
      delay: 2000,
      playOnInit: shouldStartAutoplay(),
      stopOnInteraction: true,
      stopOnMouseEnter: true
    })
  );
  const carouselPlugins = useMemo(
    () => [autoplayPlugin],
    [autoplayPlugin]
  );
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const autoplayStoppedByUser = useRef(!shouldStartAutoplay());
  const availableSkillLevels = useMemo(
    () => getAvailableSkillLevels(packets),
    [packets]
  );
  const visiblePackets = useMemo(
    () =>
      packets.filter((packet) => packet.skillLevel === activeSkillLevel),
    [activeSkillLevel, packets]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPackets(controller.signal);
    return () => controller.abort();

    async function loadPackets(signal: AbortSignal) {
      setStatus("loading");
      setError(null);
      try {
        const loadedPackets = await getInterviewPackets(signal);
        if (signal.aborted) return;
        setPackets(loadedPackets);
        setActiveSkillLevel(getInitialSkillLevel(loadedPackets));
        setSelectedIndex(0);
        setStatus("ready");
      } catch (loadError) {
        if (signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load interview packets."
        );
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (!carouselApi) return;

    const syncSelectedPacket = () => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };
    const syncAutoplay = () => {
      setIsAutoplayPlaying(autoplayPlugin.isPlaying());
    };

    if (autoplayStoppedByUser.current) autoplayPlugin.stop();
    syncSelectedPacket();
    syncAutoplay();
    carouselApi.on("select", syncSelectedPacket);
    carouselApi.on("reInit", syncSelectedPacket);
    carouselApi.on("autoplay:play", syncAutoplay);
    carouselApi.on("autoplay:stop", syncAutoplay);

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

  function selectPacket(index: number, moveFocus = false) {
    const nextIndex = Math.max(
      0,
      Math.min(index, visiblePackets.length - 1)
    );
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

  function toggleAutoplay() {
    if (autoplayPlugin.isPlaying()) {
      stopAutoplay();
    } else {
      autoplayStoppedByUser.current = false;
      autoplayPlugin.play();
      setIsAutoplayPlaying(autoplayPlugin.isPlaying());
    }
  }

  function changeSkillLevel(value: string) {
    if (
      !isSkillLevel(value)
      || !availableSkillLevels.has(value)
      || value === activeSkillLevel
    ) {
      return;
    }
    stopAutoplay();
    setCarouselApi(undefined);
    setSelectedIndex(0);
    cardRefs.current = [];
    setActiveSkillLevel(value);
  }

  return (
    <section className="h-screen overflow-y-auto bg-canvas-paper px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[80vh] max-w-7xl flex-col justify-center border-x border-border/50 py-8 [zoom:1.25]">
        <header className="mx-auto mb-8 max-w-5xl text-center">
          <div className="mx-auto mb-4 size-44 overflow-hidden rounded-3xl border-2 border-foreground bg-muted shadow-md sm:size-52">
            <img
              src={LYRA_STILL_URL}
              alt="Lyra, your AI system design interviewer"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-balance font-serif text-4xl leading-none tracking-tight text-foreground sm:text-6xl">
            Ace your next system design interview with Lyra
          </h1>
        </header>
        <div
          className="mb-8 w-full border-t border-border/50"
          aria-hidden="true"
        />

        {status === "loading" ? (
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

        {status === "error" ? (
          <Card className="mx-auto w-full max-w-2xl p-6">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          </Card>
        ) : null}

        {status === "ready" && packets.length === 0 ? (
          <Card className="mx-auto w-full max-w-2xl p-8 text-center">
            <Database className="mx-auto mb-3 size-7 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No interview packets yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a validated Markdown packet on the server, then refresh this
              page.
            </p>
          </Card>
        ) : null}

        {status === "ready" && packets.length > 0 ? (
          <Tabs
            value={activeSkillLevel}
            onValueChange={changeSkillLevel}
          >
            <Carousel
              key={activeSkillLevel}
              setApi={setCarouselApi}
              plugins={carouselPlugins}
              opts={{
                align: "center",
                loop: visiblePackets.length > 1
              }}
              aria-label={`${activeSkillLevel} interview packet carousel`}
            >
              <div
                className="mb-3 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <TabsList
                  className="mx-auto grid w-full max-w-sm grid-cols-3 sm:mx-0 sm:w-auto"
                  aria-label="Interview experience level"
                >
                  {SKILL_LEVELS.map((skillLevel) => (
                    <TabsTrigger
                      key={skillLevel}
                      value={skillLevel}
                      disabled={!availableSkillLevels.has(skillLevel)}
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

              <TabsContent
                value={activeSkillLevel}
                className="mt-0"
              >
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
                          onKeyDown={(event) =>
                            handleCardKeyDown(event, index)
                          }
                        >
                          <Card
                            className={cn(
                              "flex h-full min-h-80 flex-col gap-0 p-6 transition-[border-color,background-color,transform]",
                              isSelected
                                ? "-translate-y-0.5 border-foreground bg-card shadow-lg"
                                : "border-border/80 bg-card/70 hover:border-muted-foreground"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <Badge variant="outline">
                                Q{packet.questionNumber}
                              </Badge>
                              <Badge>{packet.skillLevel}</Badge>
                            </div>
                            <div className="flex flex-1 items-center justify-center py-6 text-center">
                              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
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

            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                size="lg"
                className="w-full max-w-sm font-semibold sm:w-auto sm:min-w-64"
                disabled={!selectedPacket}
                onClick={() =>
                  selectedPacket && onStartInterview(selectedPacket)
                }
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

function isSkillLevel(value: string): value is SkillLevel {
  return SKILL_LEVELS.some((skillLevel) => skillLevel === value);
}
