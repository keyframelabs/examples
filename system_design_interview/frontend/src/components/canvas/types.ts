import type { Edge, Node } from "@xyflow/react";

import { tableHeightForFields } from "@/components/canvas/tableLayout";

export const CANVAS_SCHEMA_VERSION = 12;

export type NodeKind = "service" | "database" | "table" | "text";

export type CanvasTool = "select" | NodeKind | "connector";

export interface CanvasField {
  id: string;
  text: string;
  primaryKey: boolean;
  foreignKey: boolean;
}

export type Cardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

export type CanvasNodeData =
  | { kind: Exclude<NodeKind, "table">; label: string }
  | { kind: "table"; label: string; fields: CanvasField[] };

export type CanvasNode = Node<CanvasNodeData, "system">;

export type CanvasEdgeData = {
  label: string;
  cardinality: Cardinality;
  isTableRelationship: boolean;
};

export type CanvasEdge = Edge<CanvasEdgeData, "system">;

export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export const EMPTY_CANVAS_SNAPSHOT: CanvasSnapshot = { nodes: [], edges: [] };

const DEFAULT_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  service: { width: 180, height: 96 },
  database: { width: 170, height: 112 },
  table: { width: 250, height: 159 },
  text: { width: 190, height: 76 }
};

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createField(text = ""): CanvasField {
  return { id: createId("field"), text, primaryKey: false, foreignKey: false };
}

export function createNode(kind: NodeKind, x: number, y: number): CanvasNode {
  const size = DEFAULT_NODE_SIZE[kind];
  const data: CanvasNodeData =
    kind === "table"
      ? { kind, label: "", fields: [createField()] }
      : { kind, label: "" };

  return {
    id: createId(kind),
    type: "system",
    position: { x, y },
    width: size.width,
    height:
      data.kind === "table"
        ? Math.max(size.height, tableHeightForFields(data.fields))
        : size.height,
    data
  };
}

export function createEdge(
  connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
  cardinality: Cardinality,
  isTableRelationship: boolean
): CanvasEdge {
  return {
    id: createId("conn"),
    type: "system",
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
    interactionWidth: 28,
    data: { label: "", cardinality, isTableRelationship }
  };
}

export function isTableNode(
  node: CanvasNode | undefined
): node is CanvasNode & { data: Extract<CanvasNodeData, { kind: "table" }> } {
  return node?.data.kind === "table";
}
