import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps
} from "@xyflow/react";
import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from "react";

import {
  anchorPosition,
  fieldHandleId,
  nodeAnchorHandleId,
  type SystemFlowNode,
  type SystemNodeData
} from "@/components/canvas/flow/adapters";
import { handleTextEditorKeyDown } from "@/components/canvas/flow/textEditing";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP,
  tableHeightForFields
} from "@/components/canvas/model/state";
import type {
  CanvasField,
  CanvasFieldSide,
  CanvasNode,
  CanvasNodeAnchor,
  CanvasTableNode
} from "@/components/canvas/model/types";
import { cn } from "@/lib/utils";

const NODE_ANCHORS: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left"
];

const TABLE_ANCHORS: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "bottom-right",
  "bottom",
  "bottom-left"
];

const nodeColors: Record<
  CanvasNode["kind"],
  { background: string; foreground: string }
> = {
  actor: {
    background: "var(--canvas-node-actor)",
    foreground: "var(--canvas-node-actor-foreground)"
  },
  service: {
    background: "var(--canvas-node-service)",
    foreground: "var(--canvas-node-service-foreground)"
  },
  database: {
    background: "var(--canvas-node-database)",
    foreground: "var(--canvas-node-database-foreground)"
  },
  table: {
    background: "var(--canvas-node-table)",
    foreground: "var(--canvas-node-table-foreground)"
  },
  text: {
    background: "transparent",
    foreground: "var(--canvas-node-text)"
  }
};

function SystemDesignNodeComponent({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<SystemFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { canvasNode, tool, readonly } = data;
  const isConnectorMode = tool === "connector" && !readonly;
  const handleVersion =
    canvasNode.kind === "table"
      ? canvasNode.fields.map((field) => field.id).join("|")
      : canvasNode.kind;

  useEffect(() => {
    updateNodeInternals(id);
  }, [handleVersion, id, updateNodeInternals]);

  return (
    <div
      data-canvas-object="node"
      data-canvas-id={id}
      className={cn(
        "relative h-full w-full cursor-move overflow-visible rounded-lg",
        selected && "outline-2 outline-offset-4 outline-dashed outline-primary"
      )}
      style={{ color: nodeColors[canvasNode.kind].foreground }}
    >
      <NodeResizer
        isVisible={selected && !readonly}
        minWidth={canvasNode.kind === "table" ? 240 : 80}
        minHeight={
          canvasNode.kind === "table"
            ? tableHeightForFields(canvasNode.fields)
            : 44
        }
        color="var(--primary)"
        handleClassName="system-design-resize-handle"
        lineClassName="system-design-resize-line"
        onResizeStart={data.onResizeStart}
        onResizeEnd={(_event, geometry) =>
          data.onResizeEnd({ id, ...geometry })
        }
      />

      {canvasNode.kind === "database" ? (
        <DatabaseNode node={canvasNode} data={data} />
      ) : canvasNode.kind === "table" ? (
        <TableNode node={canvasNode} data={data} />
      ) : canvasNode.kind === "text" ? (
        <TextNode node={canvasNode} data={data} selected={selected} />
      ) : (
        <ShapeNode node={canvasNode} data={data} />
      )}

      {(canvasNode.kind === "table" ? TABLE_ANCHORS : NODE_ANCHORS).map(
        (anchor) => (
          <CanvasHandle
            key={anchor}
            id={nodeAnchorHandleId(anchor)}
            position={anchorPosition(anchor)}
            style={anchorStyle(anchor)}
            visible={isConnectorMode}
            canStart={isConnectorMode}
            canEnd={isConnectable && !readonly}
          />
        )
      )}

      {canvasNode.kind === "table"
        ? canvasNode.fields.flatMap((field, index) =>
            (["left", "right"] satisfies CanvasFieldSide[]).map((side) => (
              <CanvasHandle
                key={`${field.id}-${side}`}
                id={fieldHandleId(field.id, side)}
                position={side === "left" ? Position.Left : Position.Right}
                style={{
                  top:
                    TABLE_FIELD_TOP +
                    index * TABLE_FIELD_HEIGHT +
                    TABLE_FIELD_HEIGHT / 2,
                  [side]: 0
                }}
                visible={isConnectorMode}
                canStart={isConnectorMode}
                canEnd={isConnectable && !readonly}
              />
            ))
          )
        : null}
    </div>
  );
}

function ShapeNode({
  node,
  data
}: {
  node: CanvasNode;
  data: SystemNodeData;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-lg border-[1.5px] px-3 text-center text-[15px] font-semibold shadow-xs"
      style={{
        background: nodeColors[node.kind].background,
        borderColor: nodeColors[node.kind].foreground
      }}
    >
      <InlineInput
        ariaLabel={`${node.kind} name`}
        placeholder="Name"
        value={node.label}
        autoFocus={data.autoFocus}
        readonly={data.readonly}
        onAutoFocus={() => data.onAutoFocusHandled(node.id)}
        onFocus={data.onEditStart}
        onBlur={data.onEditEnd}
        onEditComplete={data.onEditComplete}
        onChange={(value) => data.onLabelChange(node.id, value)}
        className="text-center text-[15px] font-semibold"
      />
    </div>
  );
}

function DatabaseNode({
  node,
  data
}: {
  node: CanvasNode;
  data: SystemNodeData;
}) {
  const cap = Math.min(24, node.height / 4);

  return (
    <div className="relative h-full w-full drop-shadow-xs">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${node.width} ${node.height}`}
        preserveAspectRatio="none"
      >
        <path
          d={`M 0 ${cap} C 0 ${cap / 2} ${node.width * 0.18} 0 ${node.width / 2} 0 C ${node.width * 0.82} 0 ${node.width} ${cap / 2} ${node.width} ${cap} L ${node.width} ${node.height - cap} C ${node.width} ${node.height - cap / 2} ${node.width * 0.82} ${node.height} ${node.width / 2} ${node.height} C ${node.width * 0.18} ${node.height} 0 ${node.height - cap / 2} 0 ${node.height - cap} Z`}
          fill={nodeColors.database.background}
          stroke={nodeColors.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M 0 ${cap} C 0 ${cap * 1.6} ${node.width * 0.18} ${cap * 2} ${node.width / 2} ${cap * 2} C ${node.width * 0.82} ${cap * 2} ${node.width} ${cap * 1.6} ${node.width} ${cap}`}
          fill="none"
          stroke={nodeColors.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <InlineInput
        ariaLabel="database name"
        placeholder="Database name"
        value={node.label}
        autoFocus={data.autoFocus}
        readonly={data.readonly}
        onAutoFocus={() => data.onAutoFocusHandled(node.id)}
        onFocus={data.onEditStart}
        onBlur={data.onEditEnd}
        onEditComplete={data.onEditComplete}
        onChange={(value) => data.onLabelChange(node.id, value)}
        className="absolute left-[14px] right-[14px] top-1/2 h-7 w-auto -translate-y-1/2 text-center text-[15px] font-semibold"
      />
    </div>
  );
}

function TableNode({
  node,
  data
}: {
  node: CanvasTableNode;
  data: SystemNodeData;
}) {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-lg border-[1.5px] shadow-xs"
      style={{
        background: nodeColors.table.background,
        borderColor: nodeColors.table.foreground
      }}
    >
      <div
        className="flex h-[38px] items-center border-b px-2"
        style={{
          background: "var(--canvas-node-table-header)",
          borderColor: nodeColors.table.foreground
        }}
      >
        <InlineInput
          ariaLabel="table title"
          placeholder="Table title"
          value={node.label}
          autoFocus={data.autoFocus}
          readonly={data.readonly}
          onAutoFocus={() => data.onAutoFocusHandled(node.id)}
          onFocus={data.onEditStart}
          onBlur={data.onEditEnd}
          onEditComplete={data.onEditComplete}
          onChange={(value) => data.onLabelChange(node.id, value)}
          className="text-[14px] font-bold"
        />
      </div>
      <div className="px-2 pt-[10px] text-[12px] text-canvas-node-service-foreground">
        {node.fields.map((field) => (
          <TableFieldRow
            key={field.id}
            tableId={node.id}
            field={field}
            data={data}
          />
        ))}
        {!data.readonly ? (
          <button
            type="button"
            aria-label={`Add row to ${node.label || "table"}`}
            className="nodrag nopan mt-1 h-6 rounded px-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onPointerDown={stopPointerPropagation}
            onClick={(event) => {
              event.stopPropagation();
              data.onAddField(node.id);
            }}
          >
            + Row
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TableFieldRow({
  tableId,
  field,
  data
}: {
  tableId: string;
  field: CanvasField;
  data: SystemNodeData;
}) {
  return (
    <div
      data-canvas-field-id={field.id}
      className="flex items-center gap-1 border-b border-canvas-node-table-foreground/20"
      style={{ height: TABLE_FIELD_HEIGHT }}
    >
      <InlineInput
        ariaLabel="column name"
        placeholder="Column name"
        value={field.text}
        readonly={data.readonly}
        onFocus={data.onEditStart}
        onBlur={data.onEditEnd}
        onEditComplete={data.onEditComplete}
        onChange={(value) => data.onFieldTextChange(tableId, field.id, value)}
        className="min-w-0 flex-1 text-[12px]"
      />
      <KeyToggle
        label="PK"
        fieldLabel={field.text || "blank row"}
        active={Boolean(field.primaryKey)}
        readonly={data.readonly}
        onToggle={() => data.onToggleFieldKey(tableId, field.id, "primaryKey")}
      />
      <KeyToggle
        label="FK"
        fieldLabel={field.text || "blank row"}
        active={Boolean(field.foreignKey)}
        readonly={data.readonly}
        onToggle={() => data.onToggleFieldKey(tableId, field.id, "foreignKey")}
      />
      {!data.readonly ? (
        <button
          type="button"
          aria-label={`Remove ${field.text || "blank"} row`}
          title="Remove row"
          className="nodrag nopan grid h-5 w-5 shrink-0 place-items-center rounded text-[13px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onPointerDown={stopPointerPropagation}
          onClick={(event) => {
            event.stopPropagation();
            data.onRemoveField(tableId, field.id);
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function KeyToggle({
  label,
  fieldLabel,
  active,
  readonly,
  onToggle
}: {
  label: "PK" | "FK";
  fieldLabel: string;
  active: boolean;
  readonly: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} for ${fieldLabel} ${active ? "enabled" : "disabled"}`}
      aria-pressed={active}
      disabled={readonly}
      className={cn(
        "nodrag nopan h-5 min-w-6 shrink-0 rounded border px-1 text-[9px] font-bold",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent"
      )}
      onPointerDown={stopPointerPropagation}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {label}
    </button>
  );
}

function TextNode({
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
        readOnly={data.readonly}
        spellCheck
        className="nopan nowheel pointer-events-none h-full w-full resize-none overflow-auto rounded-md border-0 bg-transparent p-0 text-left font-medium outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary"
        onKeyDown={(event) =>
          handleTextEditorKeyDown(event, data.onEditComplete)
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

function InlineInput({
  ariaLabel,
  placeholder,
  value,
  autoFocus = false,
  readonly,
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
  readonly: boolean;
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
        readOnly={readonly}
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

function CanvasHandle({
  id,
  position,
  style,
  visible,
  canStart,
  canEnd
}: {
  id: string;
  position: Position;
  style: CSSProperties;
  visible: boolean;
  canStart: boolean;
  canEnd: boolean;
}) {
  return (
    <Handle
      id={id}
      type="source"
      position={position}
      isConnectable={canStart || canEnd}
      isConnectableStart={canStart}
      isConnectableEnd={canEnd}
      className="nodrag nopan system-design-handle"
      style={{
        ...style,
        opacity: visible ? 1 : 0
      }}
    />
  );
}

function anchorStyle(anchor: CanvasNodeAnchor): CSSProperties {
  switch (anchor) {
    case "top-left":
      return { left: 0 };
    case "top":
      return {};
    case "top-right":
      return { left: "100%" };
    case "right":
      return {};
    case "bottom-right":
      return { left: "100%" };
    case "bottom":
      return {};
    case "bottom-left":
      return { left: 0 };
    case "left":
    default:
      return {};
  }
}

function stopPointerPropagation(event: PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function areNodePropsEqual(
  previous: NodeProps<SystemFlowNode>,
  next: NodeProps<SystemFlowNode>
): boolean {
  return (
    previous.id === next.id &&
    previous.selected === next.selected &&
    previous.isConnectable === next.isConnectable &&
    previous.data.canvasNode === next.data.canvasNode &&
    previous.data.tool === next.data.tool &&
    previous.data.readonly === next.data.readonly &&
    previous.data.autoFocus === next.data.autoFocus &&
    previous.data.onResizeStart === next.data.onResizeStart &&
    previous.data.onResizeEnd === next.data.onResizeEnd &&
    previous.data.onEditStart === next.data.onEditStart &&
    previous.data.onEditEnd === next.data.onEditEnd &&
    previous.data.onEditComplete === next.data.onEditComplete &&
    previous.data.onAutoFocusHandled === next.data.onAutoFocusHandled &&
    previous.data.onLabelChange === next.data.onLabelChange &&
    previous.data.onFieldTextChange === next.data.onFieldTextChange &&
    previous.data.onToggleFieldKey === next.data.onToggleFieldKey &&
    previous.data.onAddField === next.data.onAddField &&
    previous.data.onRemoveField === next.data.onRemoveField
  );
}

export const SystemDesignNode = memo(
  SystemDesignNodeComponent,
  areNodePropsEqual
);
