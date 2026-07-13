export const CANVAS_SCHEMA_VERSION = 12;

export type CanvasElementKind =
  | "actor"
  | "service"
  | "database"
  | "table"
  | "text"
  | "connection";

export type NodeKind = Exclude<CanvasElementKind, "connection">;
export type ShapeNodeKind = Exclude<NodeKind, "table" | "text">;

export interface CanvasField {
  id: string;
  text: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
}

export type CanvasConnectionCardinality =
  | "one-to-one"
  | "many-to-one"
  | "one-to-many"
  | "many-to-many";

export type CanvasNodeAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export type CanvasFieldSide = "left" | "right";

export interface CanvasNodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  alias?: string;
}

export interface CanvasShapeNode extends CanvasNodeGeometry {
  kind: ShapeNodeKind;
}

export interface CanvasTableNode extends CanvasNodeGeometry {
  kind: "table";
  fields: CanvasField[];
  tableType?: string;
  databaseId?: string;
}

export interface CanvasTextNode extends CanvasNodeGeometry {
  kind: "text";
  fontSize: number;
}

export type CanvasNode = CanvasShapeNode | CanvasTableNode | CanvasTextNode;

export interface CanvasConnection {
  id: string;
  kind: "connection";
  fromId: string;
  toId: string;
  fromFieldId?: string;
  toFieldId?: string;
  fromAnchor?: CanvasNodeAnchor;
  toAnchor?: CanvasNodeAnchor;
  fromFieldSide?: CanvasFieldSide;
  toFieldSide?: CanvasFieldSide;
  cardinality?: CanvasConnectionCardinality;
  label: string;
  alias?: string;
}

export type CanvasElement = CanvasNode | CanvasConnection;

export function isNode(
  element: CanvasElement | undefined
): element is CanvasNode {
  return Boolean(element && element.kind !== "connection");
}

export function isConnection(
  element: CanvasElement | undefined
): element is CanvasConnection {
  return Boolean(element && element.kind === "connection");
}

export interface CanvasState {
  version: typeof CANVAS_SCHEMA_VERSION;
  elements: Record<string, CanvasElement>;
  order: string[];
  selectedIds: string[];
}

export interface CanvasTextMetadata {
  version: typeof CANVAS_SCHEMA_VERSION;
  nodeCount: number;
  tableCount: number;
  connectionCount: number;
  characterCount: number;
}

export type CanvasTool =
  | "select"
  | "service"
  | "database"
  | "table"
  | "text"
  | "connector";
