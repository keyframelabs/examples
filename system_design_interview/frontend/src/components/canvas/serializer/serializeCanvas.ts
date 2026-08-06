import {
  CANVAS_SCHEMA_VERSION,
  isConnection,
  isNode,
  type CanvasConnectionCardinality,
  type CanvasElement,
  type CanvasField,
  type CanvasNode,
  type CanvasState,
  type CanvasTableNode,
  type CanvasTextMetadata
} from "@/components/canvas/model/types";

const CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS = 750;
const CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS = 120;

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

type AliasMap = Map<string, string>;

export function serializeCanvasToText(state: CanvasState): {
  text: string;
  metadata: CanvasTextMetadata;
} {
  const elements = orderedElements(state);
  const nodes = elements.filter(isNode);
  const tables = nodes.filter((node) => node.kind === "table") as CanvasTableNode[];
  const labels = nodes.filter((node) => node.kind === "text");
  const regularNodes = nodes.filter(
    (node) => node.kind !== "table" && node.kind !== "text"
  );
  const connections = elements.filter(isConnection);
  const aliases = buildAliases([...regularNodes, ...tables, ...labels]);

  const lines = [`Canvas v${CANVAS_SCHEMA_VERSION}`];

  if (regularNodes.length > 0) {
    lines.push("Nodes:");
    for (const node of regularNodes) {
      lines.push(
        `${node.kind} ${aliasFor(aliases, node.id)}: ${cleanText(node.label)}`
      );
    }
  }

  if (tables.length > 0) {
    lines.push("Tables:");
    for (const table of tables) {
      const tableAlias = aliasFor(aliases, table.id);
      const databaseAlias = table.databaseId
        ? aliases.get(table.databaseId)
        : undefined;
      const prefix = databaseAlias ? `${databaseAlias}.` : "";
      const tableType = cleanText(table.tableType ?? "");
      const typeSuffix = tableType ? `<${tableType}>` : "";
      const fields = table.fields
        .map(serializeField)
        .filter(Boolean);
      lines.push(`${prefix}${tableAlias}${typeSuffix}(${fields.join(", ")})`);
    }
  }

  if (labels.length > 0) {
    lines.push("Labels:");
    for (const label of labels) {
      lines.push(`${aliasFor(aliases, label.id)}: ${cleanText(label.label)}`);
    }
  }

  if (connections.length > 0) {
    lines.push("Connections:");
    for (const connection of connections) {
      const fromElement = state.elements[connection.fromId];
      const toElement = state.elements[connection.toId];
      const isTableConnection =
        fromElement?.kind === "table" && toElement?.kind === "table";
      const from = endpointAlias(
        state,
        aliases,
        connection.fromId,
        connection.fromFieldId
      );
      const to = endpointAlias(
        state,
        aliases,
        connection.toId,
        connection.toFieldId
      );
      const label = isTableConnection ? "" : cleanText(connection.label);
      const cardinality = connection.cardinality
        ? ` [${cardinalityToken(connection.cardinality)}]`
        : "";
      lines.push(
        label
          ? `${from} -> ${to}${cardinality}: ${label}`
          : `${from} -> ${to}${cardinality}`
      );
    }
  }

  const text = lines.join("\n");

  return {
    text,
    metadata: {
      version: CANVAS_SCHEMA_VERSION,
      nodeCount: nodes.length,
      tableCount: tables.length,
      connectionCount: connections.length,
      characterCount: text.length
    }
  };
}

function orderedElements(state: CanvasState): CanvasElement[] {
  const seen = new Set<string>();
  const ordered: CanvasElement[] = [];

  for (const id of state.order) {
    const element = state.elements[id];
    if (!element || seen.has(id)) continue;
    seen.add(id);
    ordered.push(element);
  }

  for (const id of Object.keys(state.elements).sort()) {
    if (seen.has(id)) continue;
    ordered.push(state.elements[id]);
  }

  return ordered;
}

function buildAliases(nodes: CanvasNode[]): AliasMap {
  const aliases: AliasMap = new Map();
  const used = new Map<string, number>();

  for (const node of nodes) {
    const base = aliasBase(node);
    const next = (used.get(base) ?? 0) + 1;
    used.set(base, next);
    aliases.set(node.id, next === 1 ? base : `${base}_${next}`);
  }

  return aliases;
}

function aliasBase(node: CanvasNode): string {
  const explicitAlias = cleanText(node.alias ?? "");
  return slugify(explicitAlias || node.label || node.kind) || node.kind;
}

function aliasFor(aliases: AliasMap, id: string): string {
  return aliases.get(id) ?? slugify(id) ?? "unknown";
}

function endpointAlias(
  state: CanvasState,
  aliases: AliasMap,
  id: string,
  fieldId?: string
): string {
  const element = state.elements[id];
  if (element?.kind === "table") {
    const databaseId = (element as CanvasTableNode).databaseId;
    const databaseAlias = databaseId ? aliases.get(databaseId) : undefined;
    const field = fieldId
      ? (element as CanvasTableNode).fields.find((item) => item.id === fieldId)
      : undefined;
    const fieldSuffix = field ? `.${fieldAlias(field)}` : "";
    if (databaseAlias) {
      return `${databaseAlias}.${aliasFor(aliases, id)}${fieldSuffix}`;
    }
    return `${aliasFor(aliases, id)}${fieldSuffix}`;
  }

  return aliasFor(aliases, id);
}

function fieldAlias(field: CanvasField): string {
  const text = cleanText(field.text);
  const firstToken = text.split(/[\s:=|]+/)[0] ?? "";
  return slugify(firstToken || text || field.id) || slugify(field.id) || "field";
}

function serializeField(field: CanvasField): string {
  const tokens = [cleanText(field.text)];
  if (field.primaryKey) tokens.push("pk");
  if (field.foreignKey) tokens.push("fk");
  return tokens.filter(Boolean).join(" ");
}

function cardinalityToken(cardinality: CanvasConnectionCardinality): string {
  switch (cardinality) {
    case "many-to-one":
      return "N:1";
    case "one-to-many":
      return "1:N";
    case "many-to-many":
      return "N:N";
    case "one-to-one":
    default:
      return "1:1";
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
