import type { KeyboardEvent } from "react";

type TextEditorElement = HTMLInputElement | HTMLTextAreaElement;

export function handleTextEditorKeyDown(
  event: KeyboardEvent<TextEditorElement>,
  onEditComplete: () => void
) {
  event.stopPropagation();
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

  event.preventDefault();
  event.currentTarget.blur();
  onEditComplete();
}
