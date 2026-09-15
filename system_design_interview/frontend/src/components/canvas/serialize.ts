import { parseHandleId } from "@/components/canvas/flow/handles";
import {
  CANVAS_SCHEMA_VERSION,
  type CanvasField,
  type CanvasNode,
  type CanvasSnapshot,
  type Cardinality
} from "@/components/canvas/types";

/**
 * Serializes the canvas into the compact text snapshot sent to the interview
 * agent. The format is stable: unchanged canvases must serialize to identical
 * text so downstream hash-based deduplication can skip resends.
 */
export function serializeCanvasToText(snapshot: CanvasSnapshot): string {
  const shapes = snapshot.nodes.filter(
    (node) => node.data.kind === "service" || node.data.kind === "database"
  );
  const tables = snapshot.nodes.filter((node) => node.data.kind === "table");
  const labels = snapshot.nodes.filter((node) => node.data.kind === "text");
  const aliases = buildAliases([...shapes, ...tables, ...labels]);
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));

  const lines = [`Canvas v${CANVAS_SCHEMA_VERSION}`];

  if (shapes.length > 0) {
    lines.push("Nodes:");
    for (const node of shapes) {
      lines.push(
        `${node.data.kind} ${aliases.get(node.id)}: ${cleanText(node.data.label)}`
      );
    }
  }

  if (tables.length > 0) {
    lines.push("Tables:");
    for (const table of tables) {
      const fields =
        table.data.kind === "table"
          ? table.data.fields.map(serializeField).filter(Boolean)
          : [];
      lines.push(`${aliases.get(table.id)}(${fields.join(", ")})`);
    }
  }

  if (labels.length > 0) {
    lines.push("Labels:");
    for (const label of labels) {
      lines.push(`${aliases.get(label.id)}: ${cleanText(label.data.label)}`);
    }
  }

  if (snapshot.edges.length > 0) {
    lines.push("Connections:");
    for (const edge of snapshot.edges) {
      const from = endpointAlias(nodeById, aliases, edge.source, edge.sourceHandle);
      const to = endpointAlias(nodeById, aliases, edge.target, edge.targetHandle);
      const label = edge.data?.isTableRelationship
        ? ""
        : cleanText(edge.data?.label ?? "");
      const cardinality = ` [${cardinalityToken(edge.data?.cardinality)}]`;
      lines.push(
        label
          ? `${from} -> ${to}${cardinality}: ${label}`
          : `${from} -> ${to}${cardinality}`
      );
    }
  }

  return lines.join("\n");
}

export const EMPTY_CANVAS_TEXT = `Canvas v${CANVAS_SCHEMA_VERSION}`;

function buildAliases(nodes: CanvasNode[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const used = new Map<string, number>();

  for (const node of nodes) {
    const base = slugify(node.data.label || node.data.kind) || node.data.kind;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    aliases.set(node.id, count === 1 ? base : `${base}_${count}`);
  }

  return aliases;
}

function endpointAlias(
  nodeById: Map<string, CanvasNode>,
  aliases: Map<string, string>,
  nodeId: string,
  handleId: string | null | undefined
): string {
  const alias = aliases.get(nodeId) ?? nodeId;
  const node = nodeById.get(nodeId);
  if (node?.data.kind !== "table") return alias;

  const handle = parseHandleId(handleId);
  const field =
    "fieldId" in handle
      ? node.data.fields.find((item) => item.id === handle.fieldId)
      : undefined;
  return field ? `${alias}.${fieldAlias(field)}` : alias;
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

function cardinalityToken(cardinality: Cardinality | undefined): string {
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
