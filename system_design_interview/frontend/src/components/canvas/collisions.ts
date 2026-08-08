import { getSmoothStepPath, Position } from "@xyflow/react";

import {
  anchorPoint,
  anchorPosition,
  parseHandleId
} from "@/components/canvas/flow/handles";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP
} from "@/components/canvas/tableLayout";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasSnapshot
} from "@/components/canvas/types";

export const CANVAS_COLLISION_GAP = 24;
export const EDGE_ROUTING_OFFSET = 32;
const CONNECTION_LABEL_COLLISION_GAP = 8;
const MAX_PASSES = 24;
const HANDLE_PATH_OFFSET = 5;

const EDGE_LABEL_MIN_WIDTH = 72;
const EDGE_LABEL_MAX_WIDTH = 180;
const EDGE_LABEL_CHARACTER_WIDTH = 7.25;
const EDGE_LABEL_HORIZONTAL_PADDING = 22;
const EDGE_LABEL_WIDTH_SCALE = 1.42;
const EDGE_LABEL_HEIGHT = 36;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function connectionLabelSize(label: string): {
  width: number;
  height: number;
} {
  const estimated =
    Math.max(label.length, "Flow label".length) * EDGE_LABEL_CHARACTER_WIDTH +
    EDGE_LABEL_HORIZONTAL_PADDING;
  const width = Math.min(
    EDGE_LABEL_MAX_WIDTH,
    Math.max(EDGE_LABEL_MIN_WIDTH, Math.ceil(estimated))
  );

  return {
    width: Math.round(width * EDGE_LABEL_WIDTH_SCALE),
    height: EDGE_LABEL_HEIGHT
  };
}

/**
 * Separates overlapping node rectangles (and connection labels) with a
 * finite, deterministic pass. Pinned nodes retain the user's chosen position
 * and displace their neighbors. Returns the input snapshot when nothing moved.
 */
export function resolveCollisions(
  snapshot: CanvasSnapshot,
  pinnedIds: Iterable<string> = []
): CanvasSnapshot {
  const pinned = new Set(pinnedIds);
  const nodes = snapshot.nodes.map((node) => ({
    ...node,
    position: { ...node.position }
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const labelEdges = snapshot.edges.filter(
    (edge) => !edge.data?.isTableRelationship
  );
  let moved = false;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let movedThisPass = false;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const first = nodes[i];
        const second = nodes[j];
        const displacement = collisionDisplacement(
          nodeRect(first),
          nodeRect(second),
          CANVAS_COLLISION_GAP,
          first.id,
          second.id
        );
        if (!displacement) continue;

        const firstPinned = pinned.has(first.id);
        const secondPinned = pinned.has(second.id);
        if (firstPinned && secondPinned) continue;

        if (secondPinned) {
          first.position.x -= displacement.x;
          first.position.y -= displacement.y;
        } else {
          // Stable order gives the earlier node priority. Moving only the
          // later node avoids the one-pixel oscillation that symmetric
          // integer splitting can produce in dense clusters.
          second.position.x += displacement.x;
          second.position.y += displacement.y;
        }

        moved = true;
        movedThisPass = true;
      }
    }

    for (const edge of labelEdges) {
      for (const node of nodes) {
        const label = connectionLabelRect(edge, nodeById);
        if (!label) continue;
        const displacement = collisionDisplacement(
          label,
          nodeRect(node),
          CONNECTION_LABEL_COLLISION_GAP,
          edge.id,
          node.id
        );
        if (!displacement) continue;

        if (pinned.has(node.id)) {
          if (!moveLabelEndpointsAway(edge, nodeById, pinned, displacement)) {
            continue;
          }
        } else {
          node.position.x += displacement.x;
          node.position.y += displacement.y;
        }

        moved = true;
        movedThisPass = true;
      }
    }

    if (!movedThisPass) break;
  }

  if (!moved) return snapshot;

  return {
    ...snapshot,
    nodes: snapshot.nodes.map((original) => {
      const settled = nodeById.get(original.id);
      return settled &&
        (settled.position.x !== original.position.x ||
          settled.position.y !== original.position.y)
        ? settled
        : original;
    })
  };
}

function nodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? node.measured?.width ?? 0,
    height: node.height ?? node.measured?.height ?? 0
  };
}

function collisionDisplacement(
  first: Rect,
  second: Rect,
  gap: number,
  firstId: string,
  secondId: string
): { x: number; y: number } | null {
  const deltaX =
    second.x + second.width / 2 - (first.x + first.width / 2);
  const deltaY =
    second.y + second.height / 2 - (first.y + first.height / 2);
  const overlapX = (first.width + second.width) / 2 + gap - Math.abs(deltaX);
  const overlapY = (first.height + second.height) / 2 + gap - Math.abs(deltaY);

  if (overlapX <= 0 || overlapY <= 0) return null;

  if (overlapX <= overlapY) {
    const direction =
      deltaX === 0 ? stableDirection(firstId, secondId) : Math.sign(deltaX);
    return { x: direction * Math.ceil(overlapX), y: 0 };
  }

  const direction =
    deltaY === 0 ? stableDirection(firstId, secondId) : Math.sign(deltaY);
  return { x: 0, y: direction * Math.ceil(overlapY) };
}

function stableDirection(firstId: string, secondId: string): 1 | -1 {
  return firstId.localeCompare(secondId) <= 0 ? 1 : -1;
}

/**
 * A pinned node overlaps this edge's label. The label cannot move on its own,
 * so pull the edge's movable endpoints back instead. Doubling the shift when
 * only one endpoint can move keeps the label midpoint clear of the pin.
 */
function moveLabelEndpointsAway(
  edge: CanvasEdge,
  nodes: ReadonlyMap<string, CanvasNode>,
  pinned: ReadonlySet<string>,
  displacement: { x: number; y: number }
): boolean {
  const endpointIds = new Set([edge.source, edge.target]);
  const movable = [...endpointIds]
    .map((id) => nodes.get(id))
    .filter((node): node is CanvasNode => Boolean(node && !pinned.has(node.id)));
  if (movable.length === 0) return false;

  const multiplier = movable.length === 1 ? 2 : 1;
  for (const node of movable) {
    node.position.x -= displacement.x * multiplier;
    node.position.y -= displacement.y * multiplier;
  }
  return true;
}

function connectionLabelRect(
  edge: CanvasEdge,
  nodes: ReadonlyMap<string, CanvasNode>
): Rect | null {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return null;

  const from = endpointGeometry(source, edge.sourceHandle);
  const to = endpointGeometry(target, edge.targetHandle);
  const [, labelX, labelY] = getSmoothStepPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: from.position,
    targetX: to.x,
    targetY: to.y,
    targetPosition: to.position,
    borderRadius: 12,
    offset: EDGE_ROUTING_OFFSET
  });
  const { width, height } = connectionLabelSize(edge.data?.label ?? "");

  return {
    x: labelX - width / 2,
    y: labelY - height / 2,
    width,
    height
  };
}

function endpointGeometry(
  node: CanvasNode,
  handleId: string | null | undefined
): { x: number; y: number; position: Position } {
  const handle = parseHandleId(handleId);

  if ("fieldId" in handle && node.data.kind === "table") {
    const fieldIndex = node.data.fields.findIndex(
      (field) => field.id === handle.fieldId
    );
    if (fieldIndex >= 0) {
      const rect = nodeRect(node);
      return {
        x:
          handle.fieldSide === "left"
            ? rect.x - HANDLE_PATH_OFFSET
            : rect.x + rect.width + HANDLE_PATH_OFFSET,
        y:
          rect.y +
          TABLE_FIELD_TOP +
          fieldIndex * TABLE_FIELD_HEIGHT +
          TABLE_FIELD_HEIGHT / 2,
        position:
          handle.fieldSide === "left" ? Position.Left : Position.Right
      };
    }
  }

  const anchor = "anchor" in handle ? handle.anchor : "right";
  const position = anchorPosition(anchor);
  const point = anchorPoint(node, anchor);

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
