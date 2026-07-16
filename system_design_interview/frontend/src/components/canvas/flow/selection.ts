import type { EdgeChange, NodeChange } from "@xyflow/react";

export interface CanvasSelectionChange {
  id: string;
  selected: boolean;
}

/**
 * Collects React Flow's controlled selection updates into one canonical batch.
 * A map preserves the first-seen order while allowing the last update for an id
 * to win when React Flow reports multiple changes during one interaction.
 */
export function flowSelectionChanges(
  nodeChanges: readonly NodeChange[],
  edgeChanges: readonly EdgeChange[]
): CanvasSelectionChange[] {
  const selectedById = new Map<string, boolean>();

  for (const change of [...nodeChanges, ...edgeChanges]) {
    if (change.type === "select") {
      selectedById.set(change.id, change.selected);
    }
  }

  return Array.from(selectedById, ([id, selected]) => ({ id, selected }));
}
