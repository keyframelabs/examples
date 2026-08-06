import {
  CANVAS_SCHEMA_VERSION,
  type CanvasConnectionCardinality,
  type CanvasConnection,
  type CanvasElement,
  type CanvasFieldSide,
  type CanvasField,
  type CanvasNodeAnchor,
  type CanvasNode,
  type CanvasState,
  type NodeKind
} from "@/components/canvas/model/types";
import { resolveCanvasCollisions } from "@/components/canvas/model/collisions";
import { tableHeightForFields } from "@/components/canvas/model/tableLayout";

export type CanvasAction =
  | { type: "add-node"; node: CanvasNode; select?: boolean }
  | { type: "add-connection"; connection: CanvasConnection; select?: boolean }
  | { type: "update-element"; id: string; patch: Partial<CanvasElement> }
  | {
      type: "update-node-geometries";
      geometries: Array<{
        id: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
    }
  | { type: "remove-table-field"; tableId: string; fieldId: string }
  | { type: "delete-elements"; ids: string[] }
  | { type: "settle-collisions"; pinnedIds?: string[] }
  | {
      type: "change-selection";
      changes: Array<{ id: string; selected: boolean }>;
    }
  | { type: "select"; ids: string[] }
  | { type: "clear-selection" };

const DEFAULT_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  actor: { width: 150, height: 74 },
  service: { width: 180, height: 96 },
  database: { width: 170, height: 112 },
  table: { width: 250, height: 159 },
  text: { width: 190, height: 76 }
};

let idCounter = 0;

function createId(prefix: string): string {
  idCounter += 1;
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}_${uuid}`
    : `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createEmptyCanvasState(): CanvasState {
  return {
    version: CANVAS_SCHEMA_VERSION,
    elements: {},
    order: [],
    selectedIds: []
  };
}

export function createField(
  overrides: Partial<CanvasField> = {}
): CanvasField {
  return {
    id: overrides.id ?? createId("field"),
    text: overrides.text ?? "",
    primaryKey: overrides.primaryKey ?? false,
    foreignKey: overrides.foreignKey ?? false
  };
}

export function createNode(
  kind: NodeKind,
  x: number,
  y: number,
  overrides: Partial<CanvasNode> = {}
): CanvasNode {
  const size = DEFAULT_NODE_SIZE[kind];
  const tableOverrides = overrides as Partial<
    Extract<CanvasNode, { kind: "table" }>
  >;
  const fields = tableOverrides.fields ?? defaultFields();
  const base = {
    id: overrides.id ?? createId(kind),
    kind,
    x,
    y,
    width: overrides.width ?? size.width,
    height:
      kind === "table"
        ? Math.max(overrides.height ?? size.height, tableHeightForFields(fields))
        : overrides.height ?? size.height,
    label: overrides.label ?? "",
    alias: overrides.alias
  };

  if (kind === "table") {
    return {
      ...base,
      kind: "table",
      fields,
      tableType: tableOverrides.tableType ?? "",
      databaseId: tableOverrides.databaseId
    };
  }

  if (kind === "text") {
    return {
      ...base,
      kind: "text",
      fontSize:
        (overrides as Partial<Extract<CanvasNode, { kind: "text" }>>).fontSize ??
        16
    };
  }

  return base as CanvasNode;
}

export function createConnection(
  fromId: string,
  toId: string,
  label = "",
  options: {
    fromFieldId?: string;
    toFieldId?: string;
    fromAnchor?: CanvasNodeAnchor;
    toAnchor?: CanvasNodeAnchor;
    fromFieldSide?: CanvasFieldSide;
    toFieldSide?: CanvasFieldSide;
    cardinality?: CanvasConnectionCardinality;
  } = {}
): CanvasConnection {
  return {
    id: createId("conn"),
    kind: "connection",
    fromId,
    toId,
    fromFieldId: options.fromFieldId,
    toFieldId: options.toFieldId,
    fromAnchor: options.fromAnchor,
    toAnchor: options.toAnchor,
    fromFieldSide: options.fromFieldSide,
    toFieldSide: options.toFieldSide,
    cardinality: options.cardinality ?? "one-to-one",
    label,
    labelSize: "large"
  };
}

export function canvasReducer(
  state: CanvasState,
  action: CanvasAction
): CanvasState {
  switch (action.type) {
    case "add-node": {
      return resolveCanvasCollisions(
        addElement(state, action.node, action.select ?? true),
        { pinnedIds: [action.node.id] }
      );
    }
    case "add-connection": {
      return resolveCanvasCollisions(
        addElement(state, action.connection, action.select ?? true)
      );
    }
    case "update-element": {
      const existing = state.elements[action.id];
      if (!existing) return state;
      const updated = normalizeElementGeometry({
        ...existing,
        ...action.patch,
        id: existing.id,
        kind: existing.kind
      } as CanvasElement);

      const nextState = {
        ...state,
        elements: {
          ...state.elements,
          [action.id]: updated
        }
      };
      const geometryChanged =
        existing.kind !== "connection" &&
        updated.kind !== "connection" &&
        (existing.width !== updated.width || existing.height !== updated.height);
      return geometryChanged
        ? resolveCanvasCollisions(nextState, { pinnedIds: [action.id] })
        : nextState;
    }
    case "update-node-geometries": {
      let elements: Record<string, CanvasElement> | null = null;

      for (const geometry of action.geometries) {
        const element = state.elements[geometry.id];
        if (!element || element.kind === "connection") continue;

        const next = normalizeElementGeometry({
          ...element,
          x: geometry.x ?? element.x,
          y: geometry.y ?? element.y,
          width: geometry.width ?? element.width,
          height: geometry.height ?? element.height
        });
        if (
          next.x === element.x &&
          next.y === element.y &&
          next.width === element.width &&
          next.height === element.height
        ) {
          continue;
        }

        elements ??= { ...state.elements };
        elements[geometry.id] = next;
      }

      return elements ? { ...state, elements } : state;
    }
    case "remove-table-field": {
      const table = state.elements[action.tableId];
      if (
        !table ||
        table.kind !== "table" ||
        !table.fields.some((field) => field.id === action.fieldId)
      ) {
        return state;
      }

      const elements: Record<string, CanvasElement> = {
        ...state.elements,
        [action.tableId]: {
          ...table,
          fields: table.fields.filter((field) => field.id !== action.fieldId)
        }
      };
      const order = state.order.filter((id) => {
        const element = state.elements[id];
        const isAttachedFieldConnection =
          element?.kind === "connection" &&
          ((element.fromId === action.tableId &&
            element.fromFieldId === action.fieldId) ||
            (element.toId === action.tableId &&
              element.toFieldId === action.fieldId));

        if (isAttachedFieldConnection) delete elements[id];
        return !isAttachedFieldConnection;
      });

      return {
        ...state,
        elements,
        order,
        selectedIds: state.selectedIds.filter((id) => Boolean(elements[id]))
      };
    }
    case "delete-elements": {
      const deleted = new Set(action.ids);
      const elements: Record<string, CanvasElement> = {};
      const order: string[] = [];

      for (const id of state.order) {
        const element = state.elements[id];
        if (!element) continue;

        const shouldDelete =
          deleted.has(id) ||
          (element.kind === "connection" &&
            (deleted.has(element.fromId) || deleted.has(element.toId)));

        if (!shouldDelete) {
          elements[id] = element;
          order.push(id);
        }
      }

      return {
        ...state,
        elements,
        order,
        selectedIds: state.selectedIds.filter((id) => elements[id])
      };
    }
    case "settle-collisions": {
      return resolveCanvasCollisions(state, {
        pinnedIds: action.pinnedIds
      });
    }
    case "change-selection": {
      if (action.changes.length === 0) return state;

      const selected = new Set(state.selectedIds);
      for (const change of action.changes) {
        if (!state.elements[change.id]) continue;
        if (change.selected) selected.add(change.id);
        else selected.delete(change.id);
      }

      const selectedIds = state.order.filter((id) => selected.has(id));
      if (sameIds(selectedIds, state.selectedIds)) return state;
      return {
        ...state,
        selectedIds
      };
    }
    case "select": {
      const selectedIds = action.ids.filter((id) => state.elements[id]);
      if (sameIds(selectedIds, state.selectedIds)) return state;
      return {
        ...state,
        selectedIds
      };
    }
    case "clear-selection": {
      if (state.selectedIds.length === 0) return state;
      return { ...state, selectedIds: [] };
    }
    default:
      return state;
  }
}

function sameIds(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((id, index) => id === second[index]);
}

function normalizeElementGeometry<T extends CanvasElement>(element: T): T {
  if (element.kind !== "table") return element;

  return {
    ...element,
    height: Math.max(element.height, tableHeightForFields(element.fields))
  } as T;
}

function addElement(
  state: CanvasState,
  element: CanvasElement,
  select: boolean
): CanvasState {
  return {
    ...state,
    elements: {
      ...state.elements,
      [element.id]: element
    },
    order: [...state.order.filter((id) => id !== element.id), element.id],
    selectedIds: select ? [element.id] : state.selectedIds
  };
}

function defaultFields(): CanvasField[] {
  return [createField()];
}
