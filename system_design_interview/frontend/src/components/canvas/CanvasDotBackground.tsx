import {
  Background,
  BackgroundVariant,
  ReactFlowProvider
} from "@xyflow/react";

import { cn } from "@/lib/utils";

const CANVAS_DOT_GAP = 24;
const CANVAS_DOT_SIZE = 4;

type CanvasDotBackgroundProps = {
  id: string;
};

export function CanvasDotBackground({ id }: CanvasDotBackgroundProps) {
  return (
    <Background
      id={id}
      variant={BackgroundVariant.Dots}
      color="var(--canvas-grid-dot)"
      gap={CANVAS_DOT_GAP}
      size={CANVAS_DOT_SIZE}
    />
  );
}

type StaticCanvasDotBackgroundProps = CanvasDotBackgroundProps & {
  className?: string;
};

export function StaticCanvasDotBackground({
  id,
  className
}: StaticCanvasDotBackgroundProps) {
  return (
    <ReactFlowProvider>
      <div
        aria-hidden="true"
        className={cn(
          "relative z-0 overflow-hidden bg-canvas-paper",
          className
        )}
      >
        <CanvasDotBackground id={id} />
      </div>
    </ReactFlowProvider>
  );
}
