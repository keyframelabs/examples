import type { PointerEvent } from "react";

import type { SystemNodeData } from "@/components/canvas/flow/adapters";
import { InlineInput } from "@/components/canvas/flow/NodeTextControls";
import { NODE_COLORS } from "@/components/canvas/flow/nodeStyles";
import {
  TABLE_FIELD_HEIGHT
} from "@/components/canvas/model/state";
import type {
  CanvasField,
  CanvasTableNode
} from "@/components/canvas/model/types";
import { cn } from "@/lib/utils";

export function TableNode({
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
        background: NODE_COLORS.table.background,
        borderColor: NODE_COLORS.table.foreground
      }}
    >
      <div
        className="flex h-[38px] items-center border-b px-2"
        style={{
          background: "var(--canvas-node-table-header)",
          borderColor: NODE_COLORS.table.foreground
        }}
      >
        <InlineInput
          ariaLabel="table title"
          placeholder="Table title"
          value={node.label}
          autoFocus={data.autoFocus}
          onAutoFocus={() => data.onAutoFocusHandled(node.id)}
          onFocus={data.onEditStart}
          onBlur={data.onEditEnd}
          onEditComplete={data.onEditComplete}
          onChange={(value) => data.onLabelChange(node.id, value)}
          className="text-lg font-bold"
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
        onFocus={data.onEditStart}
        onBlur={data.onEditEnd}
        onEditComplete={data.onEditComplete}
        onChange={(value) => data.onFieldTextChange(tableId, field.id, value)}
        className="min-w-0 flex-1 text-sm"
      />
      <KeyToggle
        label="PK"
        fieldLabel={field.text || "blank row"}
        active={Boolean(field.primaryKey)}
        onToggle={() => data.onToggleFieldKey(tableId, field.id, "primaryKey")}
      />
      <KeyToggle
        label="FK"
        fieldLabel={field.text || "blank row"}
        active={Boolean(field.foreignKey)}
        onToggle={() => data.onToggleFieldKey(tableId, field.id, "foreignKey")}
      />
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
    </div>
  );
}

function KeyToggle({
  label,
  fieldLabel,
  active,
  onToggle
}: {
  label: "PK" | "FK";
  fieldLabel: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} for ${fieldLabel} ${active ? "enabled" : "disabled"}`}
      aria-pressed={active}
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

function stopPointerPropagation(event: PointerEvent<HTMLElement>) {
  event.stopPropagation();
}
