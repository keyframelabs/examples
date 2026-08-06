import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps
} from "@xyflow/react";
import { memo, useEffect, type CSSProperties } from "react";

import {
  NODE_ANCHORS,
  TABLE_NODE_ANCHORS,
  anchorPosition,
  fieldHandleId,
  nodeAnchorHandleId,
  type SystemFlowNode
} from "@/components/canvas/flow/adapters";
import { TextNode } from "@/components/canvas/flow/NodeTextControls";
import { NODE_COLORS } from "@/components/canvas/flow/nodeStyles";
import {
  DatabaseNode,
  ShapeNode
} from "@/components/canvas/flow/ShapeNodes";
import { TableNode } from "@/components/canvas/flow/TableNode";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP,
  tableHeightForFields
} from "@/components/canvas/model/tableLayout";
import type {
  CanvasFieldSide,
  CanvasNodeAnchor
} from "@/components/canvas/model/types";
import { cn } from "@/lib/utils";

function SystemDesignNodeComponent({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<SystemFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { canvasNode, tool } = data;
  const isConnectorMode = tool === "connector";
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
      style={{ color: NODE_COLORS[canvasNode.kind].foreground }}
    >
      <NodeResizer
        isVisible={selected}
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

      {(canvasNode.kind === "table" ? TABLE_NODE_ANCHORS : NODE_ANCHORS).map(
        (anchor) => (
          <CanvasHandle
            key={anchor}
            id={nodeAnchorHandleId(anchor)}
            position={anchorPosition(anchor)}
            style={anchorStyle(anchor)}
            visible={isConnectorMode}
            canStart={isConnectorMode}
            canEnd={isConnectable}
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
                canEnd={isConnectable}
              />
            ))
          )
        : null}
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
