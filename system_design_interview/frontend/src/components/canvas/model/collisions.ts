import {
  connectionLabelRect,
  CONNECTION_LABEL_COLLISION_GAP
} from "@/components/canvas/flow/connectionLabels";
import {
  isConnection,
  isNode,
  type CanvasConnection,
  type CanvasNode,
  type CanvasState
} from "@/components/canvas/model/types";

export const CANVAS_COLLISION_GAP = 24;
const DEFAULT_MAX_PASSES = 24;

interface CollisionOptions {
  pinnedIds?: Iterable<string>;
  gap?: number;
  maxPasses?: number;
}

interface CollisionRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Separates overlapping node rectangles with a finite, deterministic pass.
 * Pinned nodes retain the user's chosen position and displace their neighbors.
 */
export function resolveCanvasCollisions(
  state: CanvasState,
  options: CollisionOptions = {}
): CanvasState {
  const pinned = new Set(options.pinnedIds ?? []);
  const gap = Math.max(0, options.gap ?? CANVAS_COLLISION_GAP);
  const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
  const nodes = orderedNodes(state).map((node) => ({ ...node }));
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const connections = orderedConnections(state);
  let moved = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let movedThisPass = false;

    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < nodes.length;
        secondIndex += 1
      ) {
        const first = nodes[firstIndex];
        const second = nodes[secondIndex];
        const displacement = collisionDisplacement(first, second, gap);
        if (!displacement) continue;

        const firstPinned = pinned.has(first.id);
        const secondPinned = pinned.has(second.id);
        if (firstPinned && secondPinned) continue;

        if (firstPinned) {
          second.x += displacement.x;
          second.y += displacement.y;
        } else if (secondPinned) {
          first.x -= displacement.x;
          first.y -= displacement.y;
        } else {
          // Stable order gives the earlier node priority. Moving only the
          // later node avoids the one-pixel oscillation that symmetric integer
          // splitting can produce in dense clusters.
          second.x += displacement.x;
          second.y += displacement.y;
        }

        moved = true;
        movedThisPass = true;
      }
    }

    for (const connection of connections) {
      for (const node of nodes) {
        const label = connectionLabelRect(connection, nodeLookup);
        if (!label) continue;
        const displacement = collisionDisplacement(
          label,
          node,
          CONNECTION_LABEL_COLLISION_GAP
        );
        if (!displacement) continue;

        if (pinned.has(node.id)) {
          if (
            !moveConnectionLabelAway(
              connection,
              nodeLookup,
              pinned,
              displacement
            )
          ) {
            continue;
          }
        } else {
          node.x += displacement.x;
          node.y += displacement.y;
        }

        moved = true;
        movedThisPass = true;
      }
    }

    if (!movedThisPass) break;
  }

  if (!moved) return state;

  const elements = { ...state.elements };
  for (const node of nodes) {
    const original = state.elements[node.id];
    if (!isNode(original)) continue;
    if (original.x === node.x && original.y === node.y) continue;
    elements[node.id] = node;
  }

  return { ...state, elements };
}

function collisionDisplacement(
  first: CollisionRect,
  second: CollisionRect,
  gap: number
): { x: number; y: number } | null {
  const firstCenterX = first.x + first.width / 2;
  const firstCenterY = first.y + first.height / 2;
  const secondCenterX = second.x + second.width / 2;
  const secondCenterY = second.y + second.height / 2;
  const deltaX = secondCenterX - firstCenterX;
  const deltaY = secondCenterY - firstCenterY;
  const overlapX =
    (first.width + second.width) / 2 + gap - Math.abs(deltaX);
  const overlapY =
    (first.height + second.height) / 2 + gap - Math.abs(deltaY);

  if (overlapX <= 0 || overlapY <= 0) return null;

  if (overlapX <= overlapY) {
    const direction = deltaX === 0 ? stableDirection(first.id, second.id) : Math.sign(deltaX);
    return { x: direction * Math.ceil(overlapX), y: 0 };
  }

  const direction = deltaY === 0 ? stableDirection(first.id, second.id) : Math.sign(deltaY);
  return { x: 0, y: direction * Math.ceil(overlapY) };
}

function moveConnectionLabelAway(
  connection: CanvasConnection,
  nodes: ReadonlyMap<string, CanvasNode>,
  pinned: ReadonlySet<string>,
  nodeDisplacement: { x: number; y: number }
): boolean {
  const endpointIds = Array.from(
    new Set([connection.fromId, connection.toId])
  );
  const movable = endpointIds
    .map((id) => nodes.get(id))
    .filter(
      (node): node is CanvasNode =>
        node !== undefined && !pinned.has(node.id)
    );
  if (movable.length === 0) return false;

  const multiplier = movable.length === 1 ? 2 : 1;
  for (const node of movable) {
    node.x -= nodeDisplacement.x * multiplier;
    node.y -= nodeDisplacement.y * multiplier;
  }
  return true;
}

function stableDirection(firstId: string, secondId: string): 1 | -1 {
  return firstId.localeCompare(secondId) <= 0 ? 1 : -1;
}

function orderedNodes(state: CanvasState): CanvasNode[] {
  const nodes: CanvasNode[] = [];
  const seen = new Set<string>();

  for (const id of state.order) {
    const element = state.elements[id];
    if (!isNode(element)) continue;
    nodes.push(element);
    seen.add(id);
  }

  for (const id of Object.keys(state.elements).sort()) {
    if (seen.has(id)) continue;
    const element = state.elements[id];
    if (isNode(element)) nodes.push(element);
  }

  return nodes;
}

function orderedConnections(state: CanvasState): CanvasConnection[] {
  const connections: CanvasConnection[] = [];
  const seen = new Set<string>();

  for (const id of state.order) {
    const element = state.elements[id];
    if (!isConnection(element)) continue;
    connections.push(element);
    seen.add(id);
  }

  for (const id of Object.keys(state.elements).sort()) {
    if (seen.has(id)) continue;
    const element = state.elements[id];
    if (isConnection(element)) connections.push(element);
  }

  return connections;
}
