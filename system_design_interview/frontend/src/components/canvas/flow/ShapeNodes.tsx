import { useCanvasActions } from "@/components/canvas/flow/CanvasActionsContext";
import { InlineInput } from "@/components/canvas/flow/NodeTextControls";
import { NODE_COLORS } from "@/components/canvas/flow/nodeStyles";

export function ServiceNode({ id, label }: { id: string; label: string }) {
  const actions = useCanvasActions();

  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-lg border-[1.5px] px-3 text-center text-lg font-semibold shadow-xs"
      style={{
        background: NODE_COLORS.service.background,
        borderColor: NODE_COLORS.service.foreground
      }}
    >
      <InlineInput
        nodeId={id}
        ariaLabel="service name"
        placeholder="Name"
        value={label}
        onChange={(value) => actions.onNodeLabelChange(id, value)}
        className="text-center text-lg font-semibold"
      />
    </div>
  );
}

export function DatabaseNode({
  id,
  label,
  width,
  height
}: {
  id: string;
  label: string;
  width: number;
  height: number;
}) {
  const actions = useCanvasActions();
  const cap = Math.min(24, height / 4);

  return (
    <div className="relative h-full w-full drop-shadow-xs">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <path
          d={`M 0 ${cap} C 0 ${cap / 2} ${width * 0.18} 0 ${width / 2} 0 C ${width * 0.82} 0 ${width} ${cap / 2} ${width} ${cap} L ${width} ${height - cap} C ${width} ${height - cap / 2} ${width * 0.82} ${height} ${width / 2} ${height} C ${width * 0.18} ${height} 0 ${height - cap / 2} 0 ${height - cap} Z`}
          fill={NODE_COLORS.database.background}
          stroke={NODE_COLORS.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M 0 ${cap} C 0 ${cap * 1.6} ${width * 0.18} ${cap * 2} ${width / 2} ${cap * 2} C ${width * 0.82} ${cap * 2} ${width} ${cap * 1.6} ${width} ${cap}`}
          fill="none"
          stroke={NODE_COLORS.database.foreground}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <InlineInput
        nodeId={id}
        ariaLabel="database name"
        placeholder="Database name"
        value={label}
        onChange={(value) => actions.onNodeLabelChange(id, value)}
        className="absolute left-[14px] right-[14px] top-1/2 h-7 w-auto -translate-y-1/2 text-center text-lg font-semibold"
      />
    </div>
  );
}
