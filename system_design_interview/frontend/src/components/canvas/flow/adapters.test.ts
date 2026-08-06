import { describe, expect, it, vi } from "vitest";

import {
  canvasStateToFlowElements,
  endpointToHandleId,
  flowConnectionToEndpoints,
  flowHandleToEndpoint,
  type FlowAdapterOptions
} from "@/components/canvas/flow/adapters";
import {
  canvasReducer,
  createConnection,
  createEmptyCanvasState,
  createNode
} from "@/components/canvas/model/state";

describe("React Flow canvas adapters", () => {
  it("derives controlled nodes and edges without changing canvas ids", () => {
    const api = createNode("service", 10, 20, { id: "api" });
    const db = createNode("database", 320, 40, { id: "db" });
    const connection = {
      ...createConnection("api", "db", "reads", {
        fromAnchor: "bottom-right",
        toAnchor: "top-left"
      }),
      id: "c1"
    };
    const state = {
      ...createEmptyCanvasState(),
      elements: { api, db, c1: connection },
      order: ["api", "db", "c1"],
      selectedIds: ["c1"]
    };

    const flow = canvasStateToFlowElements(state, adapterOptions());

    expect(flow.nodes.map((node) => node.id)).toEqual(["api", "db"]);
    expect(flow.nodes[0]).toMatchObject({
      position: { x: 10, y: 20 },
      width: api.width,
      height: api.height,
      measured: { width: api.width, height: api.height },
      style: { width: api.width, height: api.height },
      draggable: true,
      connectable: true
    });
    expect(flow.edges[0]).toMatchObject({
      id: "c1",
      source: "api",
      target: "db",
      sourceHandle: "anchor:bottom-right",
      targetHandle: "anchor:top-left",
      selected: true,
      interactionWidth: 28
    });
  });

  it("round-trips stable field handle ids", () => {
    const endpoint = {
      nodeId: "profiles",
      fieldId: "profile:id/primary",
      fieldSide: "left" as const
    };
    const handleId = endpointToHandleId(endpoint);

    expect(handleId).toBe("field:profile%3Aid%2Fprimary:left");
    expect(flowHandleToEndpoint("profiles", handleId, "right")).toEqual(
      endpoint
    );
  });

  it("converts a loose-mode flow connection to canvas endpoints", () => {
    expect(
      flowConnectionToEndpoints({
        source: "profiles",
        target: "events",
        sourceHandle: "field:profile_id:right",
        targetHandle: "field:actor_id:left"
      })
    ).toEqual({
      from: {
        nodeId: "profiles",
        fieldId: "profile_id",
        fieldSide: "right"
      },
      to: {
        nodeId: "events",
        fieldId: "actor_id",
        fieldSide: "left"
      }
    });
  });

  it("infers facing handles for legacy connections without anchors", () => {
    const api = createNode("service", 0, 0, { id: "api" });
    const db = createNode("database", 200, 0, { id: "db" });
    const withNodes = [api, db].reduce(
      (state, node) =>
        canvasReducer(state, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );
    const state = canvasReducer(withNodes, {
      type: "add-connection",
      connection: {
        ...createConnection("api", "db", "reads"),
        id: "legacy"
      },
      select: false
    });

    const flow = canvasStateToFlowElements(state, adapterOptions());

    expect(flow.edges[0]).toMatchObject({
      sourceHandle: "anchor:right",
      targetHandle: "anchor:left"
    });
  });

  it("infers bottom-to-top handles for a vertical legacy connection", () => {
    const api = createNode("service", 100, 0, {
      id: "api",
      width: 200,
      height: 100
    });
    const worker = createNode("service", 100, 260, {
      id: "worker",
      width: 200,
      height: 100
    });
    const withNodes = [api, worker].reduce(
      (state, node) =>
        canvasReducer(state, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );
    const state = canvasReducer(withNodes, {
      type: "add-connection",
      connection: {
        ...createConnection("api", "worker", "queues"),
        id: "vertical"
      },
      select: false
    });

    const flow = canvasStateToFlowElements(state, adapterOptions());

    expect(flow.edges[0]).toMatchObject({
      sourceHandle: "anchor:bottom",
      targetHandle: "anchor:top"
    });
  });
});

function adapterOptions(
  overrides: Partial<FlowAdapterOptions> = {}
): FlowAdapterOptions {
  return {
    tool: "select",
    autoFocusNodeId: null,
    onResizeStart: vi.fn(),
    onResizeEnd: vi.fn(),
    onEditStart: vi.fn(),
    onEditEnd: vi.fn(),
    onEditComplete: vi.fn(),
    onAutoFocusHandled: vi.fn(),
    onLabelChange: vi.fn(),
    onFieldTextChange: vi.fn(),
    onToggleFieldKey: vi.fn(),
    onAddField: vi.fn(),
    onRemoveField: vi.fn(),
    ...overrides
  };
}
