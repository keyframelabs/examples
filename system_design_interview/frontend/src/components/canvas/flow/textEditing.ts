import type { KeyboardEvent } from "react";

type TextEditorElement = HTMLInputElement | HTMLTextAreaElement;

export function handleTextEditorKeyDown(
  event: KeyboardEvent<TextEditorElement>,
  onEditComplete: () => void,
  options: { multiline?: boolean } = {}
) {
  event.stopPropagation();
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (options.multiline && event.shiftKey) return;

  event.preventDefault();
  event.currentTarget.blur();
  onEditComplete();
}
