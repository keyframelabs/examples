import { ScenarioCard } from "@/components/ScenarioCard";
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
        <p className="text-muted-foreground" role="status">Loading situations…</p>
      ) : catalog instanceof Error ? (
        <p className="text-destructive" role="alert">{catalog.message}</p>
      ) : scenarios.length === 0 ? (
        <p className="text-muted-foreground">No other situations are available yet.</p>
      ) : (
        <ul className="grid max-h-[calc(100vh-8rem)] gap-3 overflow-y-auto pr-1">
          {scenarios.map((scenario) => (
            <li key={scenario.scenarioId}>
              <button className="w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => onStart(scenario)}>
                <ScenarioCard compact scenario={scenario} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
