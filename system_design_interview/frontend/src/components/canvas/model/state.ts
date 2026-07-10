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

export type CanvasAction =
  | { type: "add-node"; node: CanvasNode; select?: boolean }
  | { type: "add-connection"; connection: CanvasConnection; select?: boolean }
  | { type: "update-element"; id: string; patch: Partial<CanvasElement> }
  | { type: "move-elements"; ids: string[]; dx: number; dy: number }
  | { type: "resize-node"; id: string; width: number; height: number }
  | { type: "delete-elements"; ids: string[] }
  | { type: "select"; ids: string[] }
  | { type: "clear-selection" };

const DEFAULT_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  actor: { width: 150, height: 74 },
  service: { width: 180, height: 96 },
  database: { width: 170, height: 112 },
  table: { width: 210, height: 150 },
  text: { width: 190, height: 76 }
};

export const TABLE_HEADER_HEIGHT = 38;
export const TABLE_FIELD_TOP = 48;
export const TABLE_FIELD_HEIGHT = 25;
const TABLE_FIELD_BOTTOM_PADDING = 18;

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

export function createEmptyCanvasState(): CanvasState {
  return {
    version: CANVAS_SCHEMA_VERSION,
    elements: {},
    order: [],
    selectedIds: []
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
    label: overrides.label ?? defaultLabel(kind),
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
    label
  };
}

export function canvasReducer(
  state: CanvasState,
  action: CanvasAction
): CanvasState {
  switch (action.type) {
    case "add-node": {
      return addElement(state, action.node, action.select ?? true);
    }
    case "add-connection": {
      return addElement(state, action.connection, action.select ?? true);
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

      return {
        ...state,
        elements: {
          ...state.elements,
          [action.id]: updated
        }
      };
    }
    case "move-elements": {
      const ids = new Set(action.ids);
      const elements = { ...state.elements };
      for (const id of ids) {
        const element = elements[id];
        if (!element || element.kind === "connection") continue;
        elements[id] = {
          ...element,
          x: element.x + action.dx,
          y: element.y + action.dy
        };
      }
      return { ...state, elements };
    }
    case "resize-node": {
      const element = state.elements[action.id];
      if (!element || element.kind === "connection") return state;
      return {
        ...state,
        elements: {
          ...state.elements,
          [action.id]: {
            ...element,
            width: Math.max(80, action.width),
            height:
              element.kind === "table"
                ? Math.max(tableHeightForFields(element.fields), action.height)
                : Math.max(44, action.height)
          }
        }
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
    case "select": {
      return {
        ...state,
        selectedIds: action.ids.filter((id) => state.elements[id])
      };
    }
    case "clear-selection": {
      return { ...state, selectedIds: [] };
    }
    default:
      return state;
  }
}

export function isNode(element: CanvasElement | undefined): element is CanvasNode {
  return Boolean(element && element.kind !== "connection");
}

export function isConnection(
  element: CanvasElement | undefined
): element is CanvasConnection {
  return Boolean(element && element.kind === "connection");
}

export function parseTableEditorValue(
  value: string,
  existingFields: CanvasField[] = []
): {
  label: string;
  fields: CanvasField[];
} {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const label = lines[0] ?? "Table";
  const fields = lines.slice(1).map((text, index) => ({
    id: existingFields[index]?.id ?? `field_${index + 1}`,
    text
  }));

  return {
    label,
    fields: fields.length > 0 ? fields : defaultFields()
  };
}

export function tableHeightForFields(fields: CanvasField[]): number {
  return (
    TABLE_FIELD_TOP +
    fields.length * TABLE_FIELD_HEIGHT +
    TABLE_FIELD_BOTTOM_PADDING
  );
}

function normalizeElementGeometry(element: CanvasElement): CanvasElement {
  if (element.kind !== "table") return element;

  return {
    ...element,
    height: Math.max(element.height, tableHeightForFields(element.fields))
  };
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

function defaultLabel(kind: NodeKind): string {
  switch (kind) {
    case "actor":
      return "User";
    case "service":
      return "Service";
    case "database":
      return "Database";
    case "table":
      return "users";
    case "text":
      return "Label";
    default:
      return "Node";
  }
}

function defaultFields(): CanvasField[] {
  return [
    { id: "field_1", text: "key pk" },
    { id: "field_2", text: "name" },
    { id: "field_3", text: "value" }
  ];
}
