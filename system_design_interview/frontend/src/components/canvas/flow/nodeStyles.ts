import type { CanvasNode } from "@/components/canvas/model/types";

export const NODE_COLORS: Record<
  CanvasNode["kind"],
  { background: string; foreground: string }
> = {
  actor: {
    background: "var(--canvas-node-actor)",
    foreground: "var(--canvas-node-actor-foreground)"
  },
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
