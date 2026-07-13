export type SessionLossState = {
  hasCanvasEdits: boolean;
  isSessionActive: boolean;
};

type BeforeUnloadTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

export function shouldWarnAboutSessionLoss({
  hasCanvasEdits,
  isSessionActive
}: SessionLossState): boolean {
  return hasCanvasEdits || isSessionActive;
}

export function registerSessionLossWarning(
  target: BeforeUnloadTarget
): () => void {
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = true;
  };

  target.addEventListener("beforeunload", handleBeforeUnload);
  return () => {
    target.removeEventListener("beforeunload", handleBeforeUnload);
  };
}
