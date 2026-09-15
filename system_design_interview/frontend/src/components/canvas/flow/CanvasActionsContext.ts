import { createContext, useContext } from "react";

import type { CanvasTool } from "@/components/canvas/types";

/**
 * Canvas operations shared with node and edge renderers. Keeping these in
 * context (rather than copied into every node's `data`) leaves node data as
 * pure, serializable domain state.
 */
export interface CanvasActions {
  tool: CanvasTool;
  autoFocusNodeId: string | null;
  onAutoFocusHandled: (id: string) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditComplete: () => void;
  onResizeStart: () => void;
  onResizeEnd: (id: string) => void;
  onNodeLabelChange: (id: string, label: string) => void;
  onEdgeLabelChange: (id: string, label: string) => void;
  onFieldTextChange: (tableId: string, fieldId: string, text: string) => void;
  onToggleFieldKey: (
    tableId: string,
    fieldId: string,
    key: "primaryKey" | "foreignKey"
  ) => void;
  onAddField: (tableId: string) => void;
  onRemoveField: (tableId: string, fieldId: string) => void;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
  const actions = useContext(CanvasActionsContext);
  if (!actions) {
    throw new Error("useCanvasActions requires a CanvasActionsContext provider.");
  }
  return actions;
}
