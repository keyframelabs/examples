import {
  MarkerType,
  Position,
  type Connection,
  type Edge,
  type Node
} from "@xyflow/react";

import {
  isConnection,
  isNode,
  type CanvasConnection,
  type CanvasConnectionCardinality,
  type CanvasField,
  type CanvasFieldSide,
  type CanvasNode,
  type CanvasNodeAnchor,
  type CanvasState,
  type CanvasTool
} from "@/components/canvas/model/types";

const NODE_HANDLE_PREFIX = "anchor:";
const FIELD_HANDLE_PREFIX = "field:";

export interface FlowEndpoint {
  nodeId: string;
  fieldId?: string;
  anchor?: CanvasNodeAnchor;
  fieldSide?: CanvasFieldSide;
}

export type FlowNodeGeometry = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type SystemNodeData = {
  canvasNode: CanvasNode;
  tool: CanvasTool;
  autoFocus: boolean;
  onResizeStart: () => void;
  onResizeEnd: (geometry: FlowNodeGeometry) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditComplete: () => void;
  onAutoFocusHandled: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onFieldTextChange: (tableId: string, fieldId: string, text: string) => void;
  onToggleFieldKey: (
    tableId: string,
    fieldId: string,
    key: "primaryKey" | "foreignKey"
  ) => void;
  onAddField: (tableId: string) => void;
  onRemoveField: (tableId: string, fieldId: string) => void;
};

export type SystemFlowNode = Node<SystemNodeData, "system">;

export type SystemEdgeData = {
  connection: CanvasConnection;
  isTableRelationship: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditComplete: () => void;
  onLabelChange: (id: string, label: string) => void;
};

export type SystemFlowEdge = Edge<SystemEdgeData, "system">;

export interface FlowAdapterOptions {
  tool: CanvasTool;
  autoFocusNodeId: string | null;
  onResizeStart: () => void;
  onResizeEnd: (geometry: FlowNodeGeometry) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditComplete: () => void;
  onAutoFocusHandled: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onFieldTextChange: (tableId: string, fieldId: string, text: string) => void;
  onToggleFieldKey: (
    tableId: string,
    fieldId: string,
    key: keyof Pick<CanvasField, "primaryKey" | "foreignKey">
  ) => void;
  onAddField: (tableId: string) => void;
  onRemoveField: (tableId: string, fieldId: string) => void;
}

export function canvasStateToFlowElements(
  state: CanvasState,
  options: FlowAdapterOptions
): { nodes: SystemFlowNode[]; edges: SystemFlowEdge[] } {
  const selectedIds = new Set(state.selectedIds);
  const nodes: SystemFlowNode[] = [];
  const edges: SystemFlowEdge[] = [];

  for (const id of state.order) {
    const element = state.elements[id];
    if (!element) continue;

    if (isNode(element)) {
      nodes.push(canvasNodeToFlowNode(element, selectedIds.has(id), options));
      continue;
    }

    if (isConnection(element)) {
      const edge = canvasConnectionToFlowEdge(
        state,
        element,
        selectedIds.has(id),
        options
      );
      if (edge) edges.push(edge);
    }
  }

  return { nodes, edges };
}

export function canvasNodeToFlowNode(
  node: CanvasNode,
  selected: boolean,
  options: FlowAdapterOptions
): SystemFlowNode {
  return {
    id: node.id,
    type: "system",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    measured: { width: node.width, height: node.height },
    style: { width: node.width, height: node.height },
    selected,
    draggable: options.tool === "select",
    selectable: true,
    connectable: true,
    deletable: true,
    ariaLabel: `${node.kind} node: ${node.label}`,
    data: {
      canvasNode: node,
      tool: options.tool,
      autoFocus: options.autoFocusNodeId === node.id,
      onResizeStart: options.onResizeStart,
      onResizeEnd: options.onResizeEnd,
      onEditStart: options.onEditStart,
      onEditEnd: options.onEditEnd,
      onEditComplete: options.onEditComplete,
      onAutoFocusHandled: options.onAutoFocusHandled,
      onLabelChange: options.onLabelChange,
      onFieldTextChange: options.onFieldTextChange,
      onToggleFieldKey: options.onToggleFieldKey,
      onAddField: options.onAddField,
      onRemoveField: options.onRemoveField
    }
  };
}

export function canvasConnectionToFlowEdge(
  state: CanvasState,
  connection: CanvasConnection,
  selected: boolean,
  options: FlowAdapterOptions
): SystemFlowEdge | null {
  const from = state.elements[connection.fromId];
  const to = state.elements[connection.toId];
  if (!isNode(from) || !isNode(to)) return null;

  const tableRelationship = from.kind === "table" && to.kind === "table";
  const inferredAnchors = inferConnectionAnchors(from, to);

  return {
    id: connection.id,
    type: "system",
    source: connection.fromId,
    target: connection.toId,
    sourceHandle: endpointToHandleId({
      nodeId: connection.fromId,
      fieldId: connection.fromFieldId,
      anchor: connection.fromAnchor ?? inferredAnchors.from,
      fieldSide:
        connection.fromFieldSide ??
        facingFieldSide(from, centerOf(to))
    }),
    targetHandle: endpointToHandleId({
      nodeId: connection.toId,
      fieldId: connection.toFieldId,
      anchor: connection.toAnchor ?? inferredAnchors.to,
      fieldSide:
        connection.toFieldSide ??
        facingFieldSide(to, centerOf(from))
    }),
    selected,
    selectable: true,
    deletable: true,
    reconnectable: true,
    interactionWidth: 18,
    markerEnd: tableRelationship
      ? undefined
      : {
          type: MarkerType.ArrowClosed,
          color: selected
            ? "var(--canvas-connection-selected)"
            : "var(--canvas-connection)"
        },
    ariaLabel: connection.label
      ? `Connection: ${connection.label}`
      : "Canvas connection",
    data: {
      connection,
      isTableRelationship: tableRelationship,
      onEditStart: options.onEditStart,
      onEditEnd: options.onEditEnd,
      onEditComplete: options.onEditComplete,
      onLabelChange: options.onLabelChange
    }
  };
}

export function nodeAnchorHandleId(anchor: CanvasNodeAnchor): string {
  return `${NODE_HANDLE_PREFIX}${anchor}`;
}

export function fieldHandleId(
  fieldId: string,
  side: CanvasFieldSide
): string {
  return `${FIELD_HANDLE_PREFIX}${encodeURIComponent(fieldId)}:${side}`;
}

export function endpointToHandleId(endpoint: FlowEndpoint): string {
  if (endpoint.fieldId) {
    return fieldHandleId(endpoint.fieldId, endpoint.fieldSide ?? "right");
  }

  return nodeAnchorHandleId(endpoint.anchor ?? "right");
}

export function flowHandleToEndpoint(
  nodeId: string,
  handleId: string | null | undefined,
  fallbackAnchor: CanvasNodeAnchor
): FlowEndpoint {
  if (handleId?.startsWith(FIELD_HANDLE_PREFIX)) {
    const encoded = handleId.slice(FIELD_HANDLE_PREFIX.length);
    const separator = encoded.lastIndexOf(":");
    const side = encoded.slice(separator + 1);
    const fieldId = encoded.slice(0, separator);

    if (separator > 0 && (side === "left" || side === "right")) {
      return {
        nodeId,
        fieldId: decodeURIComponent(fieldId),
        fieldSide: side
      };
    }
  }

  if (handleId?.startsWith(NODE_HANDLE_PREFIX)) {
    const anchor = handleId.slice(NODE_HANDLE_PREFIX.length);
    if (isCanvasNodeAnchor(anchor)) {
      return { nodeId, anchor };
    }
  }

  return { nodeId, anchor: fallbackAnchor };
}

export function flowConnectionToEndpoints(connection: Connection): {
  from: FlowEndpoint;
  to: FlowEndpoint;
} {
  return {
    from: flowHandleToEndpoint(
      connection.source,
      connection.sourceHandle,
      defaultAnchor("source")
    ),
    to: flowHandleToEndpoint(
      connection.target,
      connection.targetHandle,
      defaultAnchor("target")
    )
  };
}

export function cardinalityTerminals(
  cardinality?: CanvasConnectionCardinality
): ["one" | "many", "one" | "many"] {
  switch (cardinality) {
    case "one-to-many":
      return ["one", "many"];
    case "many-to-one":
      return ["many", "one"];
    case "many-to-many":
      return ["many", "many"];
    case "one-to-one":
    default:
      return ["one", "one"];
  }
}

export function anchorPosition(anchor: CanvasNodeAnchor): Position {
  switch (anchor) {
    case "top-left":
    case "top":
    case "top-right":
      return Position.Top;
    case "right":
      return Position.Right;
    case "bottom-left":
    case "bottom":
    case "bottom-right":
      return Position.Bottom;
    case "left":
    default:
      return Position.Left;
  }
}

export function inferConnectionAnchors(
  from: CanvasNode,
  to: CanvasNode
): { from: CanvasNodeAnchor; to: CanvasNodeAnchor } {
  const fromAnchor = nearestAnchor(from, centerOf(to));
  const toAnchor = nearestAnchor(to, anchorPoint(from, fromAnchor));
  return { from: fromAnchor, to: toAnchor };
}

function defaultAnchor(end: "source" | "target"): CanvasNodeAnchor {
  return end === "source" ? "right" : "left";
}

function nearestAnchor(node: CanvasNode, toward: { x: number; y: number }) {
  const anchors = node.kind === "table" ? TABLE_NODE_ANCHORS : NODE_ANCHORS;
  let nearest = anchors[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
    const point = anchorPoint(node, anchor);
    const distance = Math.hypot(point.x - toward.x, point.y - toward.y);
    if (distance < nearestDistance) {
      nearest = anchor;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function anchorPoint(node: CanvasNode, anchor: CanvasNodeAnchor) {
  const midX = node.x + node.width / 2;
  const midY = node.y + node.height / 2;
  const right = node.x + node.width;
  const bottom = node.y + node.height;

  switch (anchor) {
    case "top-left":
      return { x: node.x, y: node.y };
    case "top":
      return { x: midX, y: node.y };
    case "top-right":
      return { x: right, y: node.y };
    case "right":
      return { x: right, y: midY };
    case "bottom-right":
      return { x: right, y: bottom };
    case "bottom":
      return { x: midX, y: bottom };
    case "bottom-left":
      return { x: node.x, y: bottom };
    case "left":
    default:
      return { x: node.x, y: midY };
  }
}

export function centerOf(node: CanvasNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

export function facingFieldSide(
  node: CanvasNode,
  toward: { x: number; y: number }
): CanvasFieldSide {
  return toward.x < centerOf(node).x ? "left" : "right";
}

function isCanvasNodeAnchor(value: string): value is CanvasNodeAnchor {
  return (
    value === "top-left" ||
    value === "top" ||
    value === "top-right" ||
    value === "right" ||
    value === "bottom-right" ||
    value === "bottom" ||
    value === "bottom-left" ||
    value === "left"
  );
}

const NODE_ANCHORS: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left"
];

const TABLE_NODE_ANCHORS: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "bottom-right",
  "bottom",
  "bottom-left"
];
