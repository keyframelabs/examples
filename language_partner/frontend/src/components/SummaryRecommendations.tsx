import { ScenarioCard } from "@/components/ScenarioCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Scenario } from "@/lib/api";

export function SummaryRecommendations({
  catalog,
  currentScenarioId,
  onStart
}: {
  catalog: Scenario[] | Error | null;
  currentScenarioId: string;
  onStart: (scenario: Scenario) => void;
}) {
  const scenarios = Array.isArray(catalog)
    ? catalog.filter((scenario) => scenario.scenarioId !== currentScenarioId)
    : [];

  return (
    <aside aria-labelledby="next-situation-heading" className="border-t border-border pt-5 print:hidden lg:sticky lg:top-8 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
      <h2 className="mb-4 font-heading text-2xl leading-none" id="next-situation-heading">Try another situation</h2>
      {catalog === null ? (
        <Card asChild className="block gap-0 rounded-none border-0 bg-transparent py-0 text-muted-foreground shadow-none">
          <p role="status">Loading situations…</p>
        </Card>
      ) : catalog instanceof Error ? (
        <Alert className="block border-0 bg-transparent p-0">
          <AlertDescription className="block text-base text-destructive">{catalog.message}</AlertDescription>
        </Alert>
      ) : scenarios.length === 0 ? (
        <Card asChild className="block gap-0 rounded-none border-0 bg-transparent py-0 text-muted-foreground shadow-none">
          <p>No other situations are available yet.</p>
        </Card>
      ) : (
        <ul className="grid max-h-[calc(100vh-8rem)] gap-3 overflow-y-auto pr-1">
          {scenarios.map((scenario) => (
            <li key={scenario.scenarioId}>
              <Button className="h-auto w-full justify-start rounded-none p-0 text-left whitespace-normal hover:bg-transparent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0" onClick={() => onStart(scenario)} variant="ghost">
                <ScenarioCard compact scenario={scenario} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
