import type { EdgeChange, NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { flowSelectionChanges } from "@/components/canvas/flow/selection";

describe("React Flow selection translation", () => {
  it("combines node and edge selection changes while ignoring other changes", () => {
    const nodeChanges: NodeChange[] = [
      { type: "position", id: "api", position: { x: 10, y: 20 } },
      { type: "select", id: "api", selected: true },
      { type: "select", id: "database", selected: false }
    ];
    const edgeChanges: EdgeChange[] = [
      { type: "select", id: "connection", selected: true },
      { type: "remove", id: "removed-connection" }
    ];

    expect(flowSelectionChanges(nodeChanges, edgeChanges)).toEqual([
      { id: "api", selected: true },
      { id: "database", selected: false },
      { id: "connection", selected: true }
    ]);
  });

  it("keeps the last selection value reported for each element", () => {
    expect(
      flowSelectionChanges(
        [
          { type: "select", id: "api", selected: true },
          { type: "select", id: "api", selected: false },
          { type: "select", id: "worker", selected: true }
        ],
        [{ type: "select", id: "worker", selected: false }]
      )
    ).toEqual([
      { id: "api", selected: false },
      { id: "worker", selected: false }
    ]);
  });

  it("preserves the full modifier or marquee selection delta", () => {
    expect(
      flowSelectionChanges(
        [
          { type: "select", id: "old-selection", selected: false },
          { type: "select", id: "api", selected: true },
          { type: "select", id: "database", selected: true }
        ],
        [{ type: "select", id: "connection", selected: true }]
      )
    ).toEqual([
      { id: "old-selection", selected: false },
      { id: "api", selected: true },
      { id: "database", selected: true },
      { id: "connection", selected: true }
    ]);
  });
});
