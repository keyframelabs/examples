import type {
  SystemNodeData
} from "@/components/canvas/flow/adapters";
import { InlineInput } from "@/components/canvas/flow/NodeTextControls";
import { NODE_COLORS } from "@/components/canvas/flow/nodeStyles";
import type { CanvasNode } from "@/components/canvas/model/types";

export function ShapeNode({
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
        background: NODE_COLORS[node.kind].background,
        borderColor: NODE_COLORS[node.kind].foreground
      }}
    >
      <InlineInput
        ariaLabel={`${node.kind} name`}
        placeholder="Name"
        value={node.label}
        autoFocus={data.autoFocus}
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

export function DatabaseNode({
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
          fill={NODE_COLORS.database.background}
          stroke={NODE_COLORS.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M 0 ${cap} C 0 ${cap * 1.6} ${node.width * 0.18} ${cap * 2} ${node.width / 2} ${cap * 2} C ${node.width * 0.82} ${cap * 2} ${node.width} ${cap * 1.6} ${node.width} ${cap}`}
          fill="none"
          stroke={NODE_COLORS.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <InlineInput
        ariaLabel="database name"
        placeholder="Database name"
        value={node.label}
        autoFocus={data.autoFocus}
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
