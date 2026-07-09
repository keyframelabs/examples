import type { PersonaView } from "@keyframelabs/elements";

import type { CanvasContextSync } from "./canvasContextSync";

export type PersonaViewRuntime = {
  view: PersonaView;
  contextSync: CanvasContextSync;
  detachTranscriptObserver: () => void;
  closeState: {
    expected: boolean;
    disconnectHandled: boolean;
  };
};

export async function cleanupPersonaViewRuntime(runtime: PersonaViewRuntime): Promise<void> {
  runtime.closeState.expected = true;
  runtime.contextSync.stop();
  runtime.detachTranscriptObserver();

  try {
    await runtime.view.disconnect();
  } finally {
    runtime.view.videoElement.remove();
    runtime.view.audioElement.remove();
  }
}
