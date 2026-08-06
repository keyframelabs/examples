import type { PersonaView } from "@keyframelabs/elements";

import type { CanvasContextSync } from "@/utils/avatar/canvasContextSync";

type PersonaTranscript = {
  role: "user" | "assistant";
  text: string;
  isFinal: boolean;
};

export type PersonaViewRuntime = {
  view: PersonaView;
  contextSync: CanvasContextSync;
  detachTranscriptObserver: () => void;
  closeState: {
    expected: boolean;
    disconnectHandled: boolean;
  };
};

type PersonaRuntimeAgent = {
  on?: (event: "transcript", handler: (transcript: unknown) => void) => void;
  off?: (event: "transcript", handler: (transcript: unknown) => void) => void;
};

export function sendPersonaContext(view: PersonaView, text: string): void {
  view.sendContext(text);
}

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

export function attachPersonaTranscriptObserver(
  view: PersonaView,
  onTranscript: (transcript: PersonaTranscript) => void
): () => void {
  const agent = getPersonaRuntimeAgent(view);
  if (!agent || typeof agent.on !== "function") {
    return () => undefined;
  }

  const handleTranscript = (transcript: unknown) => {
    if (isPersonaTranscript(transcript)) {
      onTranscript(transcript);
    }
  };

  agent.on("transcript", handleTranscript);
  return () => {
    agent.off?.("transcript", handleTranscript);
  };
}

function getPersonaRuntimeAgent(view: PersonaView): PersonaRuntimeAgent | null {
  return (view as unknown as { agent?: PersonaRuntimeAgent | null }).agent ?? null;
}

function isPersonaTranscript(value: unknown): value is PersonaTranscript {
  if (!isRecord(value)) {
    return false;
  }

  return (value.role === "user" || value.role === "assistant")
    && typeof value.text === "string"
    && typeof value.isFinal === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
