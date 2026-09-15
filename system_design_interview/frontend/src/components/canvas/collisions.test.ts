import { describe, expect, it } from "vitest";

import {
  CANVAS_COLLISION_GAP,
  resolveCollisions
} from "@/components/canvas/collisions";
import { testEdge, testNode } from "@/components/canvas/testBuilders";
import type { CanvasNode, CanvasSnapshot } from "@/components/canvas/types";

function rect(node: CanvasNode) {
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + (node.width ?? 0),
    bottom: node.position.y + (node.height ?? 0)
  };
}

function overlaps(a: CanvasNode, b: CanvasNode): boolean {
  const first = rect(a);
  const second = rect(b);
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

function assertNoOverlaps(snapshot: CanvasSnapshot) {
  for (let i = 0; i < snapshot.nodes.length; i += 1) {
    for (let j = i + 1; j < snapshot.nodes.length; j += 1) {
      expect(overlaps(snapshot.nodes[i], snapshot.nodes[j])).toBe(false);
    }
  }
}

describe("resolveCollisions", () => {
  it("returns the same snapshot when nothing overlaps", () => {
    const snapshot: CanvasSnapshot = {
      nodes: [
        testNode("service", { position: { x: 0, y: 0 } }),
        testNode("service", { position: { x: 500, y: 500 } })
      ],
      edges: []
    };

    expect(resolveCollisions(snapshot)).toBe(snapshot);
  });

  it("separates overlapping nodes while keeping the pinned node in place", () => {
    const pinned = testNode("service", { id: "pinned", position: { x: 100, y: 100 } });
    const other = testNode("service", { id: "other", position: { x: 120, y: 110 } });

    const settled = resolveCollisions(
      { nodes: [pinned, other], edges: [] },
      ["pinned"]
    );

    const settledPinned = settled.nodes.find((n) => n.id === "pinned")!;
    const settledOther = settled.nodes.find((n) => n.id === "other")!;
    expect(settledPinned.position).toEqual({ x: 100, y: 100 });
    expect(settledOther.position).not.toEqual({ x: 120, y: 110 });
    assertNoOverlaps(settled);
  });

  it("settles a dense overlapping cluster deterministically", () => {
    const cluster: CanvasSnapshot = {
      nodes: Array.from({ length: 5 }, (_, index) =>
        testNode("service", {
          id: `node_${index}`,
          position: { x: index * 10, y: index * 6 }
        })
      ),
      edges: []
    };

    const first = resolveCollisions(cluster);
    const second = resolveCollisions(cluster);

    assertNoOverlaps(first);
    expect(second.nodes.map((n) => n.position)).toEqual(
      first.nodes.map((n) => n.position)
    );
    // Settled output is stable: re-resolving does not move anything further.
    expect(resolveCollisions(first)).toBe(first);
  });

  it("keeps at least the collision gap between separated nodes", () => {
    const a = testNode("service", { id: "a", position: { x: 0, y: 0 } });
    const b = testNode("service", { id: "b", position: { x: 150, y: 0 } });

    const settled = resolveCollisions({ nodes: [a, b], edges: [] }, ["a"]);
    const [left, right] = [...settled.nodes].sort(
      (first, second) => first.position.x - second.position.x
    );

    expect(right.position.x - (left.position.x + (left.width ?? 0))).toBe(
      CANVAS_COLLISION_GAP
    );
  });

  it("moves nodes out of the way of connection labels", () => {
    const source = testNode("service", { id: "src", position: { x: 0, y: 0 } });
    const target = testNode("service", { id: "dst", position: { x: 600, y: 0 } });
    // A bystander sitting on the midpoint of the edge, where the label renders.
    const bystander = testNode("service", {
      id: "bystander",
      position: { x: 300, y: -20 }
    });
    const edge = testEdge(source, target, { label: "hot path" });

    const settled = resolveCollisions({
      nodes: [source, target, bystander],
      edges: [edge]
    });

    const movedBystander = settled.nodes.find((n) => n.id === "bystander")!;
    expect(movedBystander.position).not.toEqual({ x: 300, y: -20 });
  });
});
