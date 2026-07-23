import { describe, expect, it } from "vitest";

import {
  CANVAS_COLLISION_GAP,
  resolveCanvasCollisions
} from "@/components/canvas/model/collisions";
import {
  connectionLabelDimensions,
  connectionLabelRect,
  connectionRoutingOffset,
  CONNECTION_LABEL_COLLISION_GAP
} from "@/components/canvas/flow/connectionLabels";
import {
  canvasReducer,
  createConnection,
  createEmptyCanvasState,
  createNode
} from "@/components/canvas/model/state";
import { isNode } from "@/components/canvas/model/types";

describe("canvas collision settling", () => {
  it("preserves default connection routing and label dimensions", () => {
    const connection = createConnection("source", "target", "Request");

    expect(connectionRoutingOffset(connection)).toBe(32);
    expect(connectionLabelDimensions(connection)).toEqual({
      width: 95,
      height: 26
    });
  });

  it("separates overlapping nodes while preserving the pinned node", () => {
    const pinned = createNode("service", 0, 0, {
      id: "pinned",
      width: 180,
      height: 96
    });
    const neighbor = createNode("database", 80, 20, {
      id: "neighbor",
      width: 170,
      height: 112
    });
    const state = {
      ...createEmptyCanvasState(),
      elements: { pinned, neighbor },
      order: [pinned.id, neighbor.id]
    };

    const settled = resolveCanvasCollisions(state, {
      pinnedIds: [pinned.id]
    });
    const settledPinned = settled.elements[pinned.id];
    const settledNeighbor = settled.elements[neighbor.id];

    expect(settledPinned).toMatchObject({ x: 0, y: 0 });
    expect(isNode(settledNeighbor)).toBe(true);
    if (!isNode(settledNeighbor)) return;
    expect(
      rectanglesOverlap(pinned, settledNeighbor, CANVAS_COLLISION_GAP)
    ).toBe(false);
  });

  it("returns the same state after layout has settled", () => {
    const first = createNode("service", 0, 0, { id: "first" });
    const second = createNode("service", 300, 0, { id: "second" });
    const state = [first, second].reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );

    expect(resolveCanvasCollisions(state)).toBe(state);
  });

  it("stops after a bounded number of passes", () => {
    const nodes = Array.from({ length: 8 }, (_, index) =>
      createNode("service", 0, 0, { id: `node_${index}` })
    );
    const state = nodes.reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );

    const settled = resolveCanvasCollisions(state, { maxPasses: 2 });

    expect(Object.keys(settled.elements)).toHaveLength(nodes.length);
  });

  it("fully settles a realistic dense cluster deterministically", () => {
    const nodes = Array.from({ length: 6 }, (_, index) =>
      createNode("service", index * 18, index * 12, {
        id: `dense_${index}`
      })
    );
    const state = {
      ...createEmptyCanvasState(),
      elements: Object.fromEntries(nodes.map((node) => [node.id, node])),
      order: nodes.map((node) => node.id)
    };

    const first = resolveCanvasCollisions(state);
    const second = resolveCanvasCollisions(state);
    expect(first).toEqual(second);

    const settledNodes = first.order
      .map((id) => first.elements[id])
      .filter(isNode);
    const overlaps: string[][] = [];
    for (let firstIndex = 0; firstIndex < settledNodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < settledNodes.length;
        secondIndex += 1
      ) {
        if (
          rectanglesOverlap(
            settledNodes[firstIndex],
            settledNodes[secondIndex],
            CANVAS_COLLISION_GAP
          )
        ) {
          overlaps.push([
            settledNodes[firstIndex].id,
            settledNodes[secondIndex].id
          ]);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("repels nodes from connection label boxes", () => {
    const source = createNode("service", 0, 0, {
      id: "source",
      width: 180,
      height: 96
    });
    const target = createNode("service", 260, 0, {
      id: "target",
      width: 180,
      height: 96
    });
    const connection = createConnection(source.id, target.id, "routes requests");
    const state = {
      ...createEmptyCanvasState(),
      elements: {
        [source.id]: source,
        [target.id]: target,
        [connection.id]: connection
      },
      order: [source.id, target.id, connection.id]
    };

    const settled = resolveCanvasCollisions(state);
    const settledNodes = new Map(
      settled.order
        .map((id) => settled.elements[id])
        .filter(isNode)
        .map((node) => [node.id, node])
    );
    const label = connectionLabelRect(connection, settledNodes);

    expect(label).not.toBeNull();
    if (!label) return;
    expect(
      Array.from(settledNodes.values()).some((node) =>
        rectanglesOverlap(label, node, CONNECTION_LABEL_COLLISION_GAP)
      )
    ).toBe(false);
    expect(resolveCanvasCollisions(settled)).toBe(settled);
  });

  it("keeps a pinned node fixed while its connection makes label space", () => {
    const source = createNode("service", 0, 0, { id: "source" });
    const target = createNode("service", 260, 0, { id: "target" });
    const connection = createConnection(source.id, target.id, "long request label");
    const state = {
      ...createEmptyCanvasState(),
      elements: {
        [source.id]: source,
        [target.id]: target,
        [connection.id]: connection
      },
      order: [source.id, target.id, connection.id]
    };

    const settled = resolveCanvasCollisions(state, { pinnedIds: [source.id] });

    expect(settled.elements[source.id]).toMatchObject({ x: 0, y: 0 });
    expect(settled.elements[target.id]).toMatchObject({
      x: expect.any(Number)
    });
    expect((settled.elements[target.id] as typeof target).x).toBeGreaterThan(
      target.x
    );
  });
});

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
  gap: number
) {
  return !(
    first.x + first.width + gap <= second.x ||
    second.x + second.width + gap <= first.x ||
    first.y + first.height + gap <= second.y ||
    second.y + second.height + gap <= first.y
  );
}
