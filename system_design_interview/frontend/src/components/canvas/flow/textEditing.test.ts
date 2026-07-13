import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { handleTextEditorKeyDown } from "@/components/canvas/flow/textEditing";

function editorKeyEvent(key: string, isComposing = false) {
  const blur = vi.fn();
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    key,
    nativeEvent: { isComposing },
    currentTarget: { blur },
    preventDefault,
    stopPropagation
  } as unknown as KeyboardEvent<HTMLInputElement>;

  return { event, blur, preventDefault, stopPropagation };
}

describe("handleTextEditorKeyDown", () => {
  it("finishes editing when Enter is pressed", () => {
    const onEditComplete = vi.fn();
    const { event, blur, preventDefault, stopPropagation } = editorKeyEvent(
      "Enter"
    );

    handleTextEditorKeyDown(event, onEditComplete);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(blur).toHaveBeenCalledOnce();
    expect(onEditComplete).toHaveBeenCalledOnce();
  });

  it("keeps editing for other keys", () => {
    const onEditComplete = vi.fn();
    const { event, blur, preventDefault, stopPropagation } =
      editorKeyEvent("a");

    handleTextEditorKeyDown(event, onEditComplete);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(onEditComplete).not.toHaveBeenCalled();
  });

  it("does not interrupt IME composition", () => {
    const onEditComplete = vi.fn();
    const { event, blur, preventDefault } = editorKeyEvent("Enter", true);

    handleTextEditorKeyDown(event, onEditComplete);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(onEditComplete).not.toHaveBeenCalled();
  });
});
