import {
  CANVAS_SCHEMA_VERSION,
  type CanvasElement,
  type CanvasField,
  type CanvasState
} from "@/components/canvas/model/types";

export const CANVAS_STORAGE_KEY = "kfl-system-design-canvas:v12";

export interface CanvasStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getCanvasStorage(
  target: { readonly localStorage: CanvasStorage } | undefined =
    typeof window === "undefined" ? undefined : window
): CanvasStorage | undefined {
  if (!target) return undefined;

  try {
    return target.localStorage;
  } catch {
    return undefined;
  }
}

export function loadCanvasState(
  storage: CanvasStorage | undefined,
  fallback: CanvasState
): CanvasState {
  if (!storage) return fallback;

  try {
    const serialized = storage.getItem(CANVAS_STORAGE_KEY);
    if (!serialized) return fallback;
    const parsed: unknown = JSON.parse(serialized);
    return isCanvasState(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveCanvasState(
  storage: CanvasStorage | undefined,
  state: CanvasState
): void {
  if (!storage) return;

  try {
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence should never interrupt editing when storage is unavailable.
  }
}

function isCanvasState(value: unknown): value is CanvasState {
  if (!isRecord(value)) return false;
  if (value.version !== CANVAS_SCHEMA_VERSION) return false;
  const elements = value.elements;
  if (!isRecord(elements)) return false;
  if (!Array.isArray(value.order) || !value.order.every(isString)) return false;
  if (
    !Array.isArray(value.selectedIds) ||
    !value.selectedIds.every(isString)
  ) {
    return false;
  }

  for (const [id, element] of Object.entries(elements)) {
    if (!isCanvasElement(element) || element.id !== id) return false;
  }

  return (
    value.order.every((id) => Boolean(elements[id])) &&
    value.selectedIds.every((id) => Boolean(elements[id]))
  );
}

function isCanvasElement(value: unknown): value is CanvasElement {
  if (!isRecord(value) || !isString(value.id) || !isString(value.kind)) {
    return false;
  }

  if (value.kind === "connection") {
    return (
      isString(value.fromId) &&
      isString(value.toId) &&
      isString(value.label)
    );
  }

  if (
    !isNodeKind(value.kind) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !isString(value.label)
  ) {
    return false;
  }

  if (value.kind === "table") {
    return Array.isArray(value.fields) && value.fields.every(isCanvasField);
  }

  if (value.kind === "text") {
    return isFiniteNumber(value.fontSize);
  }

  return true;
}

function isCanvasField(value: unknown): value is CanvasField {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.text) &&
    (value.primaryKey === undefined || typeof value.primaryKey === "boolean") &&
    (value.foreignKey === undefined || typeof value.foreignKey === "boolean")
  );
}

function isNodeKind(value: string) {
  return (
    value === "actor" ||
    value === "service" ||
    value === "database" ||
    value === "table" ||
    value === "text"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
