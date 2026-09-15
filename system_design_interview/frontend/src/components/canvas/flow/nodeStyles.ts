import type { NodeKind } from "@/components/canvas/types";

export const NODE_COLORS: Record<
  NodeKind,
  { background: string; foreground: string }
> = {
  service: {
    background: "var(--canvas-node-service)",
    foreground: "var(--canvas-node-service-foreground)"
  },
  database: {
    background: "var(--canvas-node-database)",
    foreground: "var(--canvas-node-database-foreground)"
  },
  table: {
    background: "var(--canvas-node-table)",
    foreground: "var(--canvas-node-table-foreground)"
  },
  text: {
    background: "transparent",
    foreground: "var(--canvas-node-text)"
  }
};
