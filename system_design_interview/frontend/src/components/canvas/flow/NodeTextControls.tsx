import {
  useRef,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  type RefObject
} from "react";

import type { SystemNodeData } from "@/components/canvas/flow/adapters";
import { handleTextEditorKeyDown } from "@/components/canvas/flow/textEditing";
import type { CanvasNode } from "@/components/canvas/model/types";
import { cn } from "@/lib/utils";

export function TextNode({
  node,
  data,
  selected
}: {
  node: Extract<CanvasNode, { kind: "text" }>;
  data: SystemNodeData;
  selected: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <NodeTextDragSurface
      controlRef={textareaRef}
      className={cn(
        "h-full w-full text-left font-medium",
        selected && "ring-1 ring-primary"
      )}
      style={{ fontSize: node.fontSize }}
    >
      <textarea
        ref={textareaRef}
        aria-label="canvas text"
        placeholder="Write a note"
        value={node.label}
        autoFocus={data.autoFocus}
        spellCheck
        className="nopan nowheel pointer-events-none h-full w-full resize-none overflow-auto rounded-md border-0 bg-transparent p-0 text-left font-medium outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary"
        onKeyDown={(event) =>
          handleTextEditorKeyDown(event, data.onEditComplete, {
            multiline: true
          })
        }
        onFocus={() => {
          if (data.autoFocus) data.onAutoFocusHandled(node.id);
          data.onEditStart();
        }}
        onBlur={data.onEditEnd}
        onChange={(event) =>
          data.onLabelChange(node.id, event.currentTarget.value)
        }
      />
    </NodeTextDragSurface>
  );
}

export function InlineInput({
  ariaLabel,
  placeholder,
  value,
  autoFocus = false,
  onAutoFocus,
  onFocus,
  onBlur,
  onEditComplete,
  onChange,
  className,
  style
}: {
  ariaLabel: string;
  placeholder: string;
  value: string;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onEditComplete: () => void;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <NodeTextDragSurface
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
        style={{
          color: "inherit",
          font: "inherit",
          textAlign: "inherit"
        }}
        onKeyDown={(event) =>
          handleTextEditorKeyDown(event, onEditComplete)
        }
        onFocus={(event: FocusEvent<HTMLInputElement>) => {
          event.stopPropagation();
          if (autoFocus) onAutoFocus?.();
          onFocus();
        }}
        onBlur={onBlur}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </NodeTextDragSurface>
  );
}

function NodeTextDragSurface({
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
  const pointerStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
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
        pointerStartRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        };
        didDragRef.current = false;
      }}
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const distance = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y
        );
        if (distance >= 4) didDragRef.current = true;
      }}
      onPointerCancel={() => {
        pointerStartRef.current = null;
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
        const end = control.value.length;
        control.setSelectionRange(end, end);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
