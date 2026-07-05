import { Position } from "@xyflow/react";

import type { CanvasNode } from "@/components/canvas/types";

export type NodeAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export type FieldSide = "left" | "right";

export const NODE_ANCHORS: readonly NodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left"
];

export const TABLE_NODE_ANCHORS: readonly NodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "bottom-right",
  "bottom",
  "bottom-left"
];

const NODE_HANDLE_PREFIX = "anchor:";
const FIELD_HANDLE_PREFIX = "field:";

export type HandleTarget =
  | { anchor: NodeAnchor }
  | { fieldId: string; fieldSide: FieldSide };

export function nodeAnchorHandleId(anchor: NodeAnchor): string {
  return `${NODE_HANDLE_PREFIX}${anchor}`;
}

export function fieldHandleId(fieldId: string, side: FieldSide): string {
  return `${FIELD_HANDLE_PREFIX}${encodeURIComponent(fieldId)}:${side}`;
}

export function parseHandleId(
  handleId: string | null | undefined
): HandleTarget {
  if (handleId?.startsWith(FIELD_HANDLE_PREFIX)) {
    const encoded = handleId.slice(FIELD_HANDLE_PREFIX.length);
    const separator = encoded.lastIndexOf(":");
    return {
      fieldId: decodeURIComponent(encoded.slice(0, separator)),
      fieldSide: encoded.slice(separator + 1) as FieldSide
    };
  }

  if (handleId?.startsWith(NODE_HANDLE_PREFIX)) {
    return { anchor: handleId.slice(NODE_HANDLE_PREFIX.length) as NodeAnchor };
  }

  return { anchor: "right" };
}

export function anchorPosition(anchor: NodeAnchor): Position {
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

export function anchorPoint(
  node: Pick<CanvasNode, "position" | "width" | "height">,
  anchor: NodeAnchor
): { x: number; y: number } {
  const { x, y } = node.position;
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const right = x + width;
  const bottom = y + height;

  switch (anchor) {
    case "top-left":
      return { x, y };
    case "top":
      return { x: midX, y };
    case "top-right":
      return { x: right, y };
    case "right":
      return { x: right, y: midY };
    case "bottom-right":
      return { x: right, y: bottom };
    case "bottom":
      return { x: midX, y: bottom };
    case "bottom-left":
      return { x, y: bottom };
    case "left":
    default:
      return { x, y: midY };
  }
}
