import type { PersonaView } from "@keyframelabs/elements";
import type { ConversationModeId } from "@/lib/conversationMode";
import { GUIDED_MODE } from "@/lib/conversationMode";
import type { SuggestedSpeechMatch } from "@/lib/speechMatching";

export function guidedSubmissionText({
  awaitingResponse,
  match,
  suggestion
}: {
  awaitingResponse: boolean;
  match: SuggestedSpeechMatch;
  suggestion: string;
}): string | null {
  return !awaitingResponse && match.complete ? suggestion : null;
}

export function personaShouldBeMuted(mode: ConversationModeId): boolean {
  return mode === GUIDED_MODE;
}

export function learnerTranscriptText({
  mode,
  pendingGuidedScript,
  providerText
}: {
  mode: ConversationModeId;
  pendingGuidedScript: string | null;
  providerText: string;
}): string | null {
  if (mode === GUIDED_MODE) return pendingGuidedScript?.trim() || null;
  return providerText.trim() || null;
}

export function submitGuidedText(
  view: { sendText?: PersonaView["sendText"] },
  text: string
): void {
  if (typeof view.sendText !== "function") {
    throw new Error("Guided text input is unavailable. Refresh the page and retry.");
  }
  view.sendText(text);
}

export function synchronizePersonaMute(
  view: Pick<PersonaView, "isMuted" | "toggleMute">,
  muted: boolean
): boolean {
  if (view.isMuted === muted) return false;
  view.toggleMute();
  return true;
}
