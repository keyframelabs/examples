import type { Scenario } from "@/lib/api";

export function ScenarioCard({
  compact = false,
  scenario,
  selected = false
}: {
  compact?: boolean;
  scenario: Scenario;
  selected?: boolean;
}) {
  const Heading = compact ? "h3" : "h2";
  return (
    <div
      className={`flex h-full flex-col border bg-card transition-transform ${compact ? "p-4" : "min-h-64 p-5"} ${selected ? "-translate-y-0.5 border-foreground shadow-lg" : "border-border/80 hover:border-muted-foreground"}`}
    >
      <div className="flex flex-1 items-center justify-center py-4 text-center">
        <Heading className={`text-balance font-semibold tracking-tight ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>
          {scenario.title}
        </Heading>
      </div>
    </div>
  );
}
