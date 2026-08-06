import type { Connection, NodeChange } from "@xyflow/react";

import type {
  FlowNodeGeometry,
  SystemFlowNode
} from "@/components/canvas/flow/adapters";
import {
  isNode,
  type CanvasConnection,
  type CanvasElement,
  type CanvasState
} from "@/components/canvas/model/types";

export function geometryChanges(
  changes: NodeChange<SystemFlowNode>[],
  state: CanvasState
): FlowNodeGeometry[] {
  const byId = new Map<string, FlowNodeGeometry>();

  for (const change of changes) {
    if (change.type !== "position" && change.type !== "dimensions") continue;
    const element = state.elements[change.id];
    if (!isNode(element)) continue;
    const geometry = byId.get(change.id) ?? {
      id: change.id,
      x: element.x,
      y: element.y
    };

    if (change.type === "position" && change.position) {
      geometry.x = change.position.x;
      geometry.y = change.position.y;
    }
    if (change.type === "dimensions" && change.dimensions) {
      geometry.width = change.dimensions.width;
      geometry.height = change.dimensions.height;
    }
    byId.set(change.id, geometry);
  }

  return [...byId.values()];
}

export function isSameFlowEndpoint(connection: Connection): boolean {
  return (
    connection.source === connection.target &&
    connection.sourceHandle === connection.targetHandle
  );
}

export function isTableRelationship(
  from: Exclude<CanvasElement, CanvasConnection>,
  to: Exclude<CanvasElement, CanvasConnection>
) {
  return from.kind === "table" && to.kind === "table";
}
