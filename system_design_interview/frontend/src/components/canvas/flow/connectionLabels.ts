import { Position, getSmoothStepPath } from "@xyflow/react";

import {
  anchorPoint,
  anchorPosition,
  centerOf,
  facingFieldSide,
  inferConnectionAnchors
} from "@/components/canvas/flow/adapters";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP
} from "@/components/canvas/model/tableLayout";
import type {
  CanvasConnection,
  CanvasFieldSide,
  CanvasNode,
  CanvasNodeAnchor
} from "@/components/canvas/model/types";

const EDGE_LABEL_MIN_WIDTH = 72;
const EDGE_LABEL_MAX_WIDTH = 180;
const EDGE_LABEL_CHARACTER_WIDTH = 7.25;
const EDGE_LABEL_HORIZONTAL_PADDING = 22;
const HANDLE_PATH_OFFSET = 5;
const LARGE_EDGE_LABEL_WIDTH_SCALE = 1.42;

export const CONNECTION_LABEL_HEIGHT = 26;
export const LARGE_CONNECTION_LABEL_HEIGHT = 36;
export const CONNECTION_LABEL_COLLISION_GAP = 8;
export const CONNECTION_ROUTING_OFFSET = 32;

export interface ConnectionLabelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EndpointGeometry {
  x: number;
  y: number;
  position: Position;
}

export function connectionLabelWidth(label: string): number {
  const estimatedWidth =
    Math.max(label.length, "Flow label".length) *
      EDGE_LABEL_CHARACTER_WIDTH +
    EDGE_LABEL_HORIZONTAL_PADDING;
  return Math.min(
    EDGE_LABEL_MAX_WIDTH,
    Math.max(EDGE_LABEL_MIN_WIDTH, Math.ceil(estimatedWidth))
  );
}

export function connectionLabelDimensions(
  connection: Pick<CanvasConnection, "label" | "labelSize">
): { width: number; height: number } {
  const defaultWidth = connectionLabelWidth(connection.label);
  if (connection.labelSize !== "large") {
    return { width: defaultWidth, height: CONNECTION_LABEL_HEIGHT };
  }

  return {
    width: Math.round(defaultWidth * LARGE_EDGE_LABEL_WIDTH_SCALE),
    height: LARGE_CONNECTION_LABEL_HEIGHT
  };
}

export function connectionRoutingOffset(
  connection: Pick<CanvasConnection, "routingOffset">
): number {
  return connection.routingOffset ?? CONNECTION_ROUTING_OFFSET;
}

export function connectionLabelRect(
  connection: CanvasConnection,
  nodes: ReadonlyMap<string, CanvasNode>
): ConnectionLabelRect | null {
  const from = nodes.get(connection.fromId);
  const to = nodes.get(connection.toId);
  if (!from || !to || (from.kind === "table" && to.kind === "table")) {
    return null;
  }

  const inferred = inferConnectionAnchors(from, to);
  const source = endpointGeometry(
    from,
    to,
    connection.fromFieldId,
    connection.fromAnchor ?? inferred.from,
    connection.fromFieldSide
  );
  const target = endpointGeometry(
    to,
    from,
    connection.toFieldId,
    connection.toAnchor ?? inferred.to,
    connection.toFieldSide
  );
  const [, labelX, labelY] = getSmoothStepPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: source.position,
    targetX: target.x,
    targetY: target.y,
    targetPosition: target.position,
    borderRadius: 12,
    offset: connectionRoutingOffset(connection)
  });
  const { width, height } = connectionLabelDimensions(connection);

  return {
    id: `connection-label:${connection.id}`,
    x: labelX - width / 2,
    y: labelY - height / 2,
    width,
    height
  };
}

function endpointGeometry(
  node: CanvasNode,
  other: CanvasNode,
  fieldId: string | undefined,
  anchor: CanvasNodeAnchor,
  fieldSide: CanvasFieldSide | undefined
): EndpointGeometry {
  if (fieldId && node.kind === "table") {
    const fieldIndex = node.fields.findIndex((field) => field.id === fieldId);
    if (fieldIndex >= 0) {
      const side = fieldSide ?? facingFieldSide(node, centerOf(other));
      return {
        x:
          side === "left"
            ? node.x - HANDLE_PATH_OFFSET
            : node.x + node.width + HANDLE_PATH_OFFSET,
        y:
          node.y +
          TABLE_FIELD_TOP +
          fieldIndex * TABLE_FIELD_HEIGHT +
          TABLE_FIELD_HEIGHT / 2,
        position: side === "left" ? Position.Left : Position.Right
      };
    }
  }

  const position = anchorPosition(anchor);
  const point = anchorPoint(node, anchor);
  return offsetHandlePoint(point, position);
}

function offsetHandlePoint(
  point: { x: number; y: number },
  position: Position
): EndpointGeometry {
  switch (position) {
    case Position.Top:
      return { x: point.x, y: point.y - HANDLE_PATH_OFFSET, position };
    case Position.Right:
      return { x: point.x + HANDLE_PATH_OFFSET, y: point.y, position };
    case Position.Bottom:
      return { x: point.x, y: point.y + HANDLE_PATH_OFFSET, position };
    case Position.Left:
    default:
      return { x: point.x - HANDLE_PATH_OFFSET, y: point.y, position };
  }
}
