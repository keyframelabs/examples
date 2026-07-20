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

const CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS = 750;
const CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS = 120;

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

export function scheduleCanvasTextSerialization(
  callback: () => void
): () => void {
  if (typeof window === "undefined") {
    const handle = globalThis.setTimeout(callback, 0);
    return () => globalThis.clearTimeout(handle);
  }

  const idleScheduler = window as unknown as {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleScheduler.requestIdleCallback === "function") {
    const handle = idleScheduler.requestIdleCallback(callback, {
      timeout: CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS
    });
    return () => idleScheduler.cancelIdleCallback?.(handle);
  }

  const handle = globalThis.setTimeout(
    callback,
    CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS
  );
  return () => globalThis.clearTimeout(handle);
}
