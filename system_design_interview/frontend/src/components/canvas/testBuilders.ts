import { fieldHandleId, nodeAnchorHandleId } from "@/components/canvas/flow/handles";
import type {
  CanvasEdge,
  CanvasField,
  CanvasNode,
  Cardinality,
  NodeKind
} from "@/components/canvas/types";

let sequence = 0;

export function testNode(
  kind: Exclude<NodeKind, "table">,
  overrides: Partial<Omit<CanvasNode, "data">> & { label?: string } = {}
): CanvasNode {
  const { label = "", ...node } = overrides;
  return {
    id: node.id ?? `${kind}_${(sequence += 1)}`,
    type: "system",
    position: { x: 0, y: 0 },
    width: 180,
    height: 96,
    ...node,
    data: { kind, label }
  };
}

export function testTable(
  overrides: Partial<Omit<CanvasNode, "data">> & {
    label?: string;
    fields?: CanvasField[];
  } = {}
): CanvasNode {
  const { label = "", fields = [], ...node } = overrides;
  return {
    id: node.id ?? `table_${(sequence += 1)}`,
    type: "system",
    position: { x: 0, y: 0 },
    width: 250,
    height: 159,
    ...node,
    data: { kind: "table", label, fields }
  };
}

export function testField(
  id: string,
  text: string,
  keys: { primaryKey?: boolean; foreignKey?: boolean } = {}
): CanvasField {
  return {
    id,
    text,
    primaryKey: keys.primaryKey ?? false,
    foreignKey: keys.foreignKey ?? false
  };
}

export function testEdge(
  source: CanvasNode,
  target: CanvasNode,
  overrides: Partial<{
    id: string;
    label: string;
    cardinality: Cardinality;
    sourceFieldId: string;
    targetFieldId: string;
  }> = {}
): CanvasEdge {
  return {
    id: overrides.id ?? `conn_${(sequence += 1)}`,
    type: "system",
    source: source.id,
    target: target.id,
    sourceHandle: overrides.sourceFieldId
      ? fieldHandleId(overrides.sourceFieldId, "right")
      : nodeAnchorHandleId("right"),
    targetHandle: overrides.targetFieldId
      ? fieldHandleId(overrides.targetFieldId, "left")
      : nodeAnchorHandleId("left"),
    data: {
      label: overrides.label ?? "",
      cardinality: overrides.cardinality ?? "one-to-one",
      isTableRelationship:
        source.data.kind === "table" && target.data.kind === "table"
    }
  };
}
