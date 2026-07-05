import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps
} from "@xyflow/react";
import { memo, useEffect, type CSSProperties } from "react";

import { useCanvasActions } from "@/components/canvas/flow/CanvasActionsContext";
import {
  NODE_ANCHORS,
  TABLE_NODE_ANCHORS,
  anchorPosition,
  fieldHandleId,
  nodeAnchorHandleId,
  type NodeAnchor
} from "@/components/canvas/flow/handles";
import { TextNode } from "@/components/canvas/flow/NodeTextControls";
import { NODE_COLORS } from "@/components/canvas/flow/nodeStyles";
import { DatabaseNode, ServiceNode } from "@/components/canvas/flow/ShapeNodes";
import { TableNode } from "@/components/canvas/flow/TableNode";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP,
  tableHeightForFields
} from "@/components/canvas/tableLayout";
import type { CanvasNode } from "@/components/canvas/types";
import { cn } from "@/lib/utils";

function SystemDesignNodeComponent({
  id,
  data,
  width,
  height,
  selected,
  isConnectable
}: NodeProps<CanvasNode>) {
  const actions = useCanvasActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const isConnectorMode = actions.tool === "connector";
  const fields = data.kind === "table" ? data.fields : null;
  // Handle positions depend on row order, so React Flow must re-measure them
  // whenever the field list changes.
  const handleVersion = fields?.map((field) => field.id).join("|") ?? data.kind;

  useEffect(() => {
    updateNodeInternals(id);
  }, [handleVersion, id, updateNodeInternals]);

  return (
    <div
      data-canvas-object="node"
      data-canvas-id={id}
      aria-label={`${data.kind} node: ${data.label}`}
      className={cn(
        "relative h-full w-full cursor-move overflow-visible rounded-lg",
        selected && "outline-2 outline-offset-4 outline-dashed outline-primary"
      )}
      style={{ color: NODE_COLORS[data.kind].foreground }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={fields ? 240 : 80}
        minHeight={fields ? tableHeightForFields(fields) : 44}
        color="var(--primary)"
        handleClassName="system-design-resize-handle"
        lineClassName="system-design-resize-line"
        onResizeStart={actions.onResizeStart}
        onResizeEnd={() => actions.onResizeEnd(id)}
      />

      {data.kind === "database" ? (
        <DatabaseNode
          id={id}
          label={data.label}
          width={width ?? 0}
          height={height ?? 0}
        />
      ) : data.kind === "table" ? (
        <TableNode id={id} label={data.label} fields={data.fields} />
      ) : data.kind === "text" ? (
        <TextNode id={id} label={data.label} selected={selected} />
      ) : (
        <ServiceNode id={id} label={data.label} />
      )}

      {(fields ? TABLE_NODE_ANCHORS : NODE_ANCHORS).map((anchor) => (
        <CanvasHandle
          key={anchor}
          id={nodeAnchorHandleId(anchor)}
          position={anchorPosition(anchor)}
          style={anchorStyle(anchor)}
          visible={isConnectorMode}
          canStart={isConnectorMode}
          canEnd={isConnectable}
        />
      ))}

      {fields?.flatMap((field, index) =>
        (["left", "right"] as const).map((side) => (
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
            canEnd={isConnectable}
          />
        ))
      )}
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
      style={{ ...style, opacity: visible ? 1 : 0 }}
    />
  );
}

function anchorStyle(anchor: NodeAnchor): CSSProperties {
  switch (anchor) {
    case "top-left":
    case "bottom-left":
      return { left: 0 };
    case "top-right":
    case "bottom-right":
      return { left: "100%" };
    default:
      return {};
  }
}

export const SystemDesignNode = memo(SystemDesignNodeComponent);
