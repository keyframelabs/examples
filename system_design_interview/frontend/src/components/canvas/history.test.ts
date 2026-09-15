import { describe, expect, it } from "vitest";

import { snapshotsEqual } from "@/components/canvas/history";
import { testEdge, testNode } from "@/components/canvas/testBuilders";
import type { CanvasSnapshot } from "@/components/canvas/types";

function makeSnapshot(): CanvasSnapshot {
  const a = testNode("service", { id: "a", label: "A" });
  const b = testNode("service", { id: "b", position: { x: 400, y: 0 } });
  return { nodes: [a, b], edges: [testEdge(a, b)] };
}

/**
 * snapshotsEqual decides what becomes an undo entry: selection changes and
 * no-op interactions must compare equal, while geometry and data changes
 * must not.
 */
describe("snapshotsEqual", () => {
  it("treats selection-only changes as equal, so they create no undo entry", () => {
    const before = makeSnapshot();
    const after: CanvasSnapshot = {
      nodes: before.nodes.map((node) => ({ ...node, selected: true })),
      edges: before.edges.map((edge) => ({ ...edge, selected: true }))
    };

    expect(snapshotsEqual(before, after)).toBe(true);
  });

  it("treats a drag that returns to the origin as equal", () => {
    const before = makeSnapshot();
    const after: CanvasSnapshot = {
      ...before,
      nodes: before.nodes.map((node) => ({
        ...node,
        position: { ...node.position }
      }))
    };

    expect(snapshotsEqual(before, after)).toBe(true);
  });

  it("detects moved nodes", () => {
    const before = makeSnapshot();
    const after: CanvasSnapshot = {
      ...before,
      nodes: before.nodes.map((node, index) =>
        index === 0
          ? { ...node, position: { x: 50, y: 50 } }
          : node
      )
    };

    expect(snapshotsEqual(before, after)).toBe(false);
  });

  it("detects data changes such as labels and reconnected endpoints", () => {
    const before = makeSnapshot();
    const relabeled: CanvasSnapshot = {
      ...before,
      nodes: before.nodes.map((node, index) =>
        index === 0 ? { ...node, data: { ...node.data, label: "renamed" } } : node
      )
    };
    const reconnected: CanvasSnapshot = {
      ...before,
      edges: before.edges.map((edge) => ({ ...edge, target: "a" }))
    };

    expect(snapshotsEqual(before, relabeled)).toBe(false);
    expect(snapshotsEqual(before, reconnected)).toBe(false);
  });

  it("detects added and removed elements", () => {
    const before = makeSnapshot();
    const withExtra: CanvasSnapshot = {
      ...before,
      nodes: [...before.nodes, testNode("database")]
    };

    expect(snapshotsEqual(before, withExtra)).toBe(false);
    expect(snapshotsEqual(withExtra, before)).toBe(false);
  });
});
