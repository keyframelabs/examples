import { createEmptyCanvasState } from "@/components/canvas/model/state";
import type { CanvasState } from "@/components/canvas/model/types";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";

export interface CanvasSessionDefaults {
  initialState: CanvasState;
  canvasText: string;
}

export function createCanvasSessionDefaults(): CanvasSessionDefaults {
  const initialState = createEmptyCanvasState();

  return {
    initialState,
    canvasText: serializeCanvasToText(initialState).text
  };
}
