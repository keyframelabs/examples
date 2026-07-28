import { describe, expect, it } from "vitest";
import { getSmoothStepPath } from "@xyflow/react";

import {
  CANVAS_COLLISION_GAP,
  resolveCanvasCollisions
} from "@/components/canvas/model/collisions";
import {
  anchorPoint,
  anchorPosition
} from "@/components/canvas/flow/adapters";
import {
  connectionLabelDimensions,
  connectionLabelRect,
  connectionRoutingOffset
} from "@/components/canvas/flow/connectionLabels";
import {
  createCanvasSessionDefaults,
  createTinyUrlCanvasState,
  TINYURL_PACKET_ID
} from "@/components/canvas/model/interviewCanvasTemplates";
import {
  isConnection,
  isNode,
  type CanvasConnection,
  type CanvasNode
} from "@/components/canvas/model/types";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";

describe("interview canvas templates", () => {
  it("selects the TinyURL template only for the TinyURL packet", () => {
    const tinyUrl = createCanvasSessionDefaults(TINYURL_PACKET_ID);
    const otherPacket = createCanvasSessionDefaults("news-feed-system-design");
    const noPacket = createCanvasSessionDefaults();

    expect(tinyUrl.initialState.order.length).toBeGreaterThan(0);
    expect(otherPacket.initialState).toMatchObject({
      elements: {},
      order: [],
      selectedIds: []
    });
    expect(noPacket.initialState).toMatchObject({
      elements: {},
      order: [],
      selectedIds: []
    });
    expect(otherPacket.canvasText).toBe("Canvas v12");
  });

  it("builds the required SQL-backed TinyURL architecture", () => {
    const state = createTinyUrlCanvasState();
    const nodes = state.order
      .map((id) => state.elements[id])
      .filter(isNode);
    const connections = state.order
      .map((id) => state.elements[id])
      .filter(isConnection);
    const nodeByLabel = new Map(nodes.map((node) => [node.label, node]));

    expect(nodes.filter((node) => node.kind === "text")).toEqual([]);
    expect(nodes.map((node) => node.label)).toEqual([
      "User",
      "Load Balancer",
      "URL Service",
      "SQL Primary",
      "URL Map"
    ]);
    expect(nodes.map(({ id, alias }) => ({ id, alias }))).toEqual([
      { id: "tinyurl_client", alias: "user" },
      { id: "tinyurl_load_balancer", alias: "load_balancer" },
      { id: "tinyurl_api_redirect", alias: "url_service" },
      { id: "tinyurl_sql_primary", alias: "sql_primary" },
      { id: "tinyurl_url_mappings", alias: "url_map" }
    ]);
    expect(connections).toHaveLength(6);
    expect(state.order).toHaveLength(11);
    expect(state.selectedIds).toEqual([]);
    expect(nodeByLabel.get("User")?.kind).toBe("actor");

    const table = nodeByLabel.get("URL Map");
    expect(table?.kind).toBe("table");
    if (!table || table.kind !== "table") return;
    expect(table.databaseId).toBe(nodeByLabel.get("SQL Primary")?.id);
    expect(
      table.fields.map(({ text, primaryKey, foreignKey }) => ({
        text,
        primaryKey,
        foreignKey
      }))
    ).toEqual([
      { text: "short_code", primaryKey: true, foreignKey: false },
      { text: "long_url", primaryKey: false, foreignKey: false },
      { text: "created_at", primaryKey: false, foreignKey: false },
      { text: "expires_at", primaryKey: false, foreignKey: false }
    ]);

    const stateText = JSON.stringify(state);
    expect(stateText).not.toMatch(
      /Cache|SQL Replica|sql_replica|owner_id|status|Analytics|Event Stream|click events?|workers|analytics storage|callout/i
    );
    expect(stateText.match(/301 Redirect/g)).toHaveLength(1);
    expect(stateText).not.toContain("302");
  });

  it("matches the reference topology, directions, labels, and anchors", () => {
    const { connections, nodeByLabel } = canvasParts();

    const request = expectConnection(
      connections,
      nodeByLabel,
      "User",
      "Load Balancer",
      "Request",
      "right",
      "left"
    );
    const longUrlRedirect = expectConnection(
      connections,
      nodeByLabel,
      "Load Balancer",
      "User",
      "Long URL Redirect",
      "top-left",
      "top-right"
    );
    const route = expectConnection(
      connections,
      nodeByLabel,
      "Load Balancer",
      "URL Service",
      "Route",
      "right",
      "left"
    );
    const redirect = expectConnection(
      connections,
      nodeByLabel,
      "URL Service",
      "Load Balancer",
      "301 Redirect",
      "bottom-left",
      "bottom-right"
    );
    expect(connections).not.toContainEqual(
      expect.objectContaining({
        fromId: nodeByLabel.get("URL Service")?.id,
        toId: nodeByLabel.get("User")?.id
      })
    );
    expect(
      connections.filter((connection) => connection.label === "301 Redirect")
    ).toHaveLength(1);
    expect(connections.some((connection) => connection.label.includes("302"))).toBe(
      false
    );
    expect(connectionPath(request, nodeByLabel)).not.toBe(
      connectionPath(longUrlRedirect, nodeByLabel)
    );
    expect(connectionPath(route, nodeByLabel)).not.toBe(
      connectionPath(redirect, nodeByLabel)
    );
  });

  it("models the direct database lookup and table write paths", () => {
    const { connections, nodeByLabel } = canvasParts();
    expectConnection(
      connections,
      nodeByLabel,
      "URL Service",
      "SQL Primary",
      "Lookup",
      "right",
      "left"
    );
    expectConnection(
      connections,
      nodeByLabel,
      "URL Service",
      "URL Map",
      "Write",
      "bottom",
      "top"
    );

    expect(connections).not.toContainEqual(
      expect.objectContaining({
        fromId: nodeByLabel.get("URL Service")?.id,
        toId: nodeByLabel.get("URL Map")?.id,
        label: "Cache Miss"
      })
    );
    expect(nodeByLabel.has("Cache")).toBe(false);
  });

  it("opts only the reference labels and return loops into larger presentation", () => {
    const { connections, nodeByLabel, nodes } = canvasParts();
    const loops = new Map([
      ["Long URL Redirect", -16],
      ["301 Redirect", 16]
    ]);
    const nodesById = nodeByLabelById(nodes);

    expect(connections.map((connection) => connection.labelSize)).toEqual(
      Array.from({ length: 6 }, () => "large")
    );
    for (const connection of connections) {
      expect(connectionRoutingOffset(connection)).toBe(
        loops.has(connection.label) ? 48 : 32
      );
      if (!loops.has(connection.label)) {
        expect(connection.routingOffset).toBeUndefined();
        continue;
      }

      const loopRect = connectionLabelRect(connection, nodesById);
      const defaultRect = connectionLabelRect(
        { ...connection, routingOffset: undefined },
        nodesById
      );
      expect(loopRect).not.toBeNull();
      expect(defaultRect).not.toBeNull();
      expect(centerY(loopRect!) - centerY(defaultRect!)).toBe(
        loops.get(connection.label)
      );
      expect(connectionPath(connection, nodeByLabel)).not.toBe(
        connectionPath(
          { ...connection, routingOffset: undefined },
          nodeByLabel
        )
      );
    }

    expect(
      connectionLabelDimensions({ label: "Request", labelSize: "large" })
    ).toEqual({ width: 135, height: 36 });
    expect(
      connectionLabelDimensions({
        label: "Long URL Redirect",
        labelSize: "large"
      })
    ).toEqual({ width: 207, height: 36 });
  });

  it("returns fresh deterministic state and its matching avatar text", () => {
    const first = createCanvasSessionDefaults(TINYURL_PACKET_ID);
    const second = createCanvasSessionDefaults(TINYURL_PACKET_ID);

    expect(first.initialState).toEqual(second.initialState);
    expect(first.initialState).not.toBe(second.initialState);
    expect(first.initialState.elements).not.toBe(second.initialState.elements);
    expect(first.canvasText).toBe(serializeCanvasToText(first.initialState).text);
    expect(first.canvasText).toBe(
      [
        "Canvas v12",
        "Nodes:",
        "actor user: User",
        "service load_balancer: Load Balancer",
        "service url_service: URL Service",
        "database sql_primary: SQL Primary",
        "Tables:",
        "sql_primary.url_map<SQL>(short_code pk, long_url, created_at, expires_at)",
        "Connections:",
        "user -> load_balancer: Request",
        "load_balancer -> user: Long URL Redirect",
        "load_balancer -> url_service: Route",
        "url_service -> load_balancer: 301 Redirect",
        "url_service -> sql_primary: Lookup",
        "url_service -> sql_primary.url_map: Write"
      ].join("\n")
    );
    expect(first.canvasText).not.toMatch(
      /Cache|SQL Replica|sql_replica|owner_id|status|Analytics|Event Stream|click events?|workers|analytics storage|callout/i
    );
    expect(first.canvasText.match(/301 Redirect/g)).toHaveLength(1);
    expect(first.canvasText).not.toContain("302");
  });

  it("preserves the reference geometry through collision settling", () => {
    const initialState = createTinyUrlCanvasState();
    const state = resolveCanvasCollisions(initialState);
    const nodes = state.order
      .map((id) => state.elements[id])
      .filter(isNode);
    const nodeByLabel = new Map(nodes.map((node) => [node.label, node]));
    const expectedGeometry = {
      User: { x: -107, y: 18, width: 160, height: 104 },
      "Load Balancer": { x: 353, y: 8, width: 222, height: 134 },
      "URL Service": { x: 928, y: 8, width: 220, height: 132 },
      "SQL Primary": { x: 1453, y: -7, width: 240, height: 158 },
      "URL Map": { x: 863, y: 558, width: 352, height: 260 }
    };

    expect(state).toBe(initialState);
    for (const [label, geometry] of Object.entries(expectedGeometry)) {
      const node = nodeByLabel.get(label);
      expect(node, `Missing node: ${label}`).toBeDefined();
      expect(node?.x).toBeCloseTo(geometry.x, 5);
      expect(node?.y).toBeCloseTo(geometry.y, 5);
      expect(node?.width).toBeCloseTo(geometry.width, 5);
      expect(node?.height).toBeCloseTo(geometry.height, 5);
    }

    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < nodes.length;
        secondIndex += 1
      ) {
        expect(
          overlaps(
            nodes[firstIndex],
            nodes[secondIndex],
            CANVAS_COLLISION_GAP
          ),
          `${nodes[firstIndex].label} is too close to ${nodes[secondIndex].label}`
        ).toBe(false);
      }
    }

    const connections = state.order
      .map((id) => state.elements[id])
      .filter(isConnection);
    const labelRects = connections.map((connection) => {
      const rect = connectionLabelRect(connection, nodeByLabelById(nodes));
      expect(rect, `Missing label rect: ${connection.label}`).not.toBeNull();
      return { connection, rect: rect! };
    });
    const expectedLabelRects = {
      Request: { x: 135.5, y: 54.5, width: 135, height: 36 },
      "Long URL Redirect": { x: 99.5, y: -63, width: 207, height: 36 },
      Route: { x: 684, y: 56.5, width: 135, height: 36 },
      "301 Redirect": { x: 674, y: 177, width: 155, height: 36 },
      Lookup: { x: 1233, y: 55, width: 135, height: 36 },
      Write: { x: 971, y: 331, width: 135, height: 36 }
    };
    for (const { connection, rect } of labelRects) {
      const expected =
        expectedLabelRects[
          connection.label as keyof typeof expectedLabelRects
        ];
      expect(expected, `Unexpected label: ${connection.label}`).toBeDefined();
      expect(rect.x).toBeCloseTo(expected.x, 2);
      expect(rect.y).toBeCloseTo(expected.y, 2);
      expect(rect.width).toBeCloseTo(expected.width, 2);
      expect(rect.height).toBeCloseTo(expected.height, 2);
    }
    for (const { connection, rect } of labelRects) {
      for (const node of nodes) {
        expect(
          rectanglesOverlap(rect, node),
          `${connection.label} label overlaps ${node.label}`
        ).toBe(false);
      }
    }
    for (let firstIndex = 0; firstIndex < labelRects.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < labelRects.length;
        secondIndex += 1
      ) {
        expect(
          rectanglesOverlap(
            labelRects[firstIndex].rect,
            labelRects[secondIndex].rect
          ),
          `${labelRects[firstIndex].connection.label} overlaps ${labelRects[secondIndex].connection.label}`
        ).toBe(false);
      }
    }
  });
});

function canvasParts() {
  const state = createTinyUrlCanvasState();
  const nodes = state.order
    .map((id) => state.elements[id])
    .filter(isNode);
  const connections = state.order
    .map((id) => state.elements[id])
    .filter(isConnection);

  return {
    connections,
    nodeByLabel: new Map(nodes.map((node) => [node.label, node])),
    nodes
  };
}

function expectConnection(
  connections: CanvasConnection[],
  nodeByLabel: Map<string, CanvasNode>,
  fromLabel: string,
  toLabel: string,
  label: string,
  fromAnchor?: CanvasConnection["fromAnchor"],
  toAnchor?: CanvasConnection["toAnchor"]
): CanvasConnection {
  const from = nodeByLabel.get(fromLabel);
  const to = nodeByLabel.get(toLabel);

  expect(from, `Missing node: ${fromLabel}`).toBeDefined();
  expect(to, `Missing node: ${toLabel}`).toBeDefined();
  const matches = connections.filter(
    (connection) =>
      connection.fromId === from?.id &&
      connection.toId === to?.id &&
      connection.label === label
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({
    fromId: from?.id,
    toId: to?.id,
    label,
    ...(fromAnchor ? { fromAnchor } : {}),
    ...(toAnchor ? { toAnchor } : {})
  });
  return matches[0]!;
}

function connectionPath(
  connection: CanvasConnection,
  nodeByLabel: ReadonlyMap<string, CanvasNode>
): string {
  const nodesById = nodeByLabelById(Array.from(nodeByLabel.values()));
  const from = nodesById.get(connection.fromId);
  const to = nodesById.get(connection.toId);
  expect(from).toBeDefined();
  expect(to).toBeDefined();
  expect(connection.fromAnchor).toBeDefined();
  expect(connection.toAnchor).toBeDefined();
  const source = anchorPoint(from!, connection.fromAnchor!);
  const target = anchorPoint(to!, connection.toAnchor!);

  return getSmoothStepPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: anchorPosition(connection.fromAnchor!),
    targetX: target.x,
    targetY: target.y,
    targetPosition: anchorPosition(connection.toAnchor!),
    borderRadius: 12,
    offset: connectionRoutingOffset(connection)
  })[0];
}

function nodeByLabelById(nodes: CanvasNode[]): Map<string, CanvasNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function centerY(rect: { y: number; height: number }): number {
  return rect.y + rect.height / 2;
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function overlaps(
  first: CanvasNode,
  second: CanvasNode,
  gap: number
): boolean {
  return !(
    first.x + first.width + gap <= second.x ||
    second.x + second.width + gap <= first.x ||
    first.y + first.height + gap <= second.y ||
    second.y + second.height + gap <= first.y
  );
}
