import { useCallback, useState } from "react";
import {
  SystemDesignCanvas,
  type CanvasState
} from "@kfl-system-design/infinite-canvas";

import { FloatingAvatarWindow } from "./features/avatar/FloatingAvatarWindow";
import { initialSystemDesignCanvas } from "./features/interview/initialCanvas";

export function App() {
  const [canvasState, setCanvasState] = useState<CanvasState>(initialSystemDesignCanvas);
  const [canvasText, setCanvasText] = useState("Canvas v8");

  const handleCanvasTextChange = useCallback((text: string) => {
    setCanvasText(text);
  }, []);

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-canvas-paper text-canvas-ink">
      <div className="absolute inset-0">
        <SystemDesignCanvas
          initialState={initialSystemDesignCanvas}
          className="h-full"
          onCanvasChange={setCanvasState}
          onCanvasTextChange={handleCanvasTextChange}
        />
      </div>

      <FloatingAvatarWindow
        canvasState={canvasState}
        canvasText={canvasText}
      />
    </main>
  );
}
