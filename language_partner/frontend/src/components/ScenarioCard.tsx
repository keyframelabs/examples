import { Card } from "@/components/ui/card";
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
  return (
    <Card asChild
      className={`gap-0 rounded-none py-0 shadow-none transition-transform ${compact ? "h-24 w-full p-4" : "h-full min-h-64 p-5"} ${selected ? "-translate-y-0.5 border-foreground shadow-lg" : "border-border/80 hover:border-muted-foreground"}`}
    >
      <span>
        <span className={`flex w-full flex-1 items-center justify-center text-center ${compact ? "" : "py-4"}`}>
          <span
            aria-level={compact ? 3 : 2}
            className={`block text-balance font-semibold tracking-tight ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}
            role="heading"
          >
            {scenario.title}
          </span>
        </span>
      </span>
    </Card>
  );
}
