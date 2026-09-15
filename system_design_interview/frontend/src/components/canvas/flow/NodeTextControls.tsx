import {
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from "react";

import { useCanvasActions } from "@/components/canvas/flow/CanvasActionsContext";
import { handleTextEditorKeyDown } from "@/components/canvas/flow/textEditing";
import { cn } from "@/lib/utils";

export function TextNode({
  id,
  label,
  selected
}: {
  id: string;
  label: string;
  selected: boolean;
}) {
  const actions = useCanvasActions();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoFocus = actions.autoFocusNodeId === id;

  return (
    <TextDragSurface
      controlRef={textareaRef}
      className={cn(
        "h-full w-full text-left text-base font-medium",
        selected && "ring-1 ring-primary"
      )}
    >
      <textarea
        ref={textareaRef}
        aria-label="canvas text"
        placeholder="Write a note"
        value={label}
        autoFocus={autoFocus}
        spellCheck
        className="nopan nowheel pointer-events-none h-full w-full resize-none overflow-auto rounded-md border-0 bg-transparent p-0 text-left font-medium outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary"
        onKeyDown={(event) =>
          handleTextEditorKeyDown(event, actions.onEditComplete, {
            multiline: true
          })
        }
        onFocus={() => {
          if (autoFocus) actions.onAutoFocusHandled(id);
          actions.onEditStart();
        }}
        onBlur={actions.onEditEnd}
        onChange={(event) =>
          actions.onNodeLabelChange(id, event.currentTarget.value)
        }
      />
    </TextDragSurface>
  );
}

export function InlineInput({
  nodeId,
  ariaLabel,
  placeholder,
  value,
  onChange,
  className,
  style
}: {
  nodeId: string;
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const actions = useCanvasActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoFocus = actions.autoFocusNodeId === nodeId;

  return (
    <TextDragSurface
      controlRef={inputRef}
      className={cn("w-full", className)}
      style={style}
    >
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        spellCheck
        className="nopan pointer-events-none h-full w-full border-0 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground/60 focus:rounded-sm focus:bg-card/80 focus:ring-1 focus:ring-primary"
        style={{ color: "inherit", font: "inherit", textAlign: "inherit" }}
        onKeyDown={(event) =>
          handleTextEditorKeyDown(event, actions.onEditComplete)
        }
        onFocus={(event) => {
          event.stopPropagation();
          if (autoFocus) actions.onAutoFocusHandled(nodeId);
          actions.onEditStart();
        }}
        onBlur={actions.onEditEnd}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </TextDragSurface>
  );
}

/**
 * Lets one surface serve both node dragging and click-to-edit: the wrapped
 * control ignores pointer events, and a click that never crossed the drag
 * threshold focuses it. React Flow offers no built-in way to distinguish the
 * two on a full-bleed input.
 */
function TextDragSurface({
  controlRef,
  className,
  style,
  children
}: {
  controlRef: RefObject<HTMLInputElement | HTMLTextAreaElement>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  return (
    <div
      className={cn(
        "relative cursor-grab select-none active:cursor-grabbing",
        className
      )}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        didDragRef.current = false;
      }}
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (!start) return;
        didDragRef.current ||=
          Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4;
      }}
      onClick={(event) => {
        event.stopPropagation();
        pointerStartRef.current = null;
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }

        const control = controlRef.current;
        if (!control) return;
        control.focus();
        control.setSelectionRange(control.value.length, control.value.length);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
