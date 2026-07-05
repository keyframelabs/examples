import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  type ConnectionLineComponentProps,
  type EdgeProps
} from "@xyflow/react";
import { memo, type CSSProperties, type SyntheticEvent } from "react";

import {
  EDGE_ROUTING_OFFSET,
  connectionLabelSize
} from "@/components/canvas/collisions";
import { useCanvasActions } from "@/components/canvas/flow/CanvasActionsContext";
import { handleTextEditorKeyDown } from "@/components/canvas/flow/textEditing";
import type { CanvasEdge, CanvasNode, Cardinality } from "@/components/canvas/types";

type Point = { x: number; y: number };
type Multiplicity = "one" | "many";

const MARKER_GAP = 6;
const MARKER_HEIGHT = 16;
const CROW_LENGTH = 16;
const CROW_SPREAD = 8;
const EDGE_STROKE_WIDTH = 3;
const SELECTED_EDGE_STROKE_WIDTH = 4;

function SystemDesignEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
  style,
  interactionWidth
}: EdgeProps<CanvasEdge>) {
  const actions = useCanvasActions();
  if (!data) return null;

  const stroke = selected
    ? "var(--canvas-connection-selected)"
    : "var(--canvas-connection)";
  const strokeWidth = selected
    ? SELECTED_EDGE_STROKE_WIDTH
    : EDGE_STROKE_WIDTH;
  const [fromTerminal, toTerminal] = cardinalityTerminals(data.cardinality);
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const pathSource = data.isTableRelationship
    ? offsetForTerminal(source, sourcePosition, fromTerminal)
    : source;
  const pathTarget = data.isTableRelationship
    ? offsetForTerminal(target, targetPosition, toTerminal)
    : target;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: pathSource.x,
    sourceY: pathSource.y,
    sourcePosition,
    targetX: pathTarget.x,
    targetY: pathTarget.y,
    targetPosition,
    borderRadius: 12,
    offset: EDGE_ROUTING_OFFSET
  });
  const labelSize = connectionLabelSize(data.label);

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={data.isTableRelationship ? undefined : markerEnd}
        interactionWidth={interactionWidth}
        style={{
          ...style,
          stroke,
          strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }}
      />

      {data.isTableRelationship ? (
        <>
          <RelationshipMarker
            point={source}
            position={sourcePosition}
            terminal={fromTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <RelationshipMarker
            point={target}
            position={targetPosition}
            terminal={toTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      ) : (
        <EdgeLabelRenderer>
          <div
            data-connection-label-id={id}
            className="nodrag nopan pointer-events-auto absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: 1001 + (selected ? 1 : 0)
            }}
          >
            <input
              aria-label="Connection label"
              className="nodrag nopan block rounded-sm border border-border bg-card px-2 py-1 text-center text-lg font-medium leading-none text-foreground outline-none transition-[width,border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              style={{
                width: labelSize.width,
                height: labelSize.height,
                boxShadow:
                  "0 0 0 3px var(--canvas-paper), 0 2px 5px rgb(0 0 0 / 0.14)"
              }}
              value={data.label}
              placeholder="Flow label"
              onChange={(event) =>
                actions.onEdgeLabelChange(id, event.currentTarget.value)
              }
              onFocus={(event) => {
                stopPropagation(event);
                actions.onEditStart();
              }}
              onBlur={(event) => {
                stopPropagation(event);
                actions.onEditEnd();
              }}
              onPointerDown={stopPropagation}
              onClick={stopPropagation}
              onDoubleClick={stopPropagation}
              onKeyDown={(event) =>
                handleTextEditorKeyDown(event, actions.onEditComplete)
              }
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const SystemDesignEdge = memo(SystemDesignEdgeComponent);

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

function cardinalityTerminals(
  cardinality: Cardinality
): [Multiplicity, Multiplicity] {
  switch (cardinality) {
    case "one-to-many":
      return ["one", "many"];
    case "many-to-one":
      return ["many", "one"];
    case "many-to-many":
      return ["many", "many"];
    case "one-to-one":
    default:
      return ["one", "one"];
  }
}

function RelationshipMarker({
  point,
  position,
  terminal,
  stroke,
  strokeWidth
}: {
  point: Point;
  position: Position;
  terminal: Multiplicity;
  stroke: string;
  strokeWidth: number;
}) {
  const direction = positionVector(position);
  const normal = { x: -direction.y, y: direction.x };
  const toe = add(point, scale(direction, MARKER_GAP));

  if (terminal === "one") {
    const start = add(toe, scale(normal, MARKER_HEIGHT / 2));
    const end = add(toe, scale(normal, -MARKER_HEIGHT / 2));
    return (
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pointerEvents="none"
      />
    );
  }

  const joint = add(point, scale(direction, MARKER_GAP + CROW_LENGTH));
  const spreadStart = add(toe, scale(normal, CROW_SPREAD));
  const spreadEnd = add(toe, scale(normal, -CROW_SPREAD));

  return (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      <line x1={joint.x} y1={joint.y} x2={toe.x} y2={toe.y} />
      <line x1={joint.x} y1={joint.y} x2={spreadStart.x} y2={spreadStart.y} />
      <line x1={joint.x} y1={joint.y} x2={spreadEnd.x} y2={spreadEnd.y} />
    </g>
  );
}

export const SystemDesignConnectionLine = memo(
  function SystemDesignConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
    connectionStatus
  }: ConnectionLineComponentProps<CanvasNode>) {
    const [path] = getSmoothStepPath({
      sourceX: fromX,
      sourceY: fromY,
      sourcePosition: fromPosition,
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition,
      borderRadius: 12,
      offset: EDGE_ROUTING_OFFSET
    });
    const style: CSSProperties = {
      fill: "none",
      stroke:
        connectionStatus === "invalid"
          ? "var(--destructive)"
          : "var(--primary)",
      strokeWidth: EDGE_STROKE_WIDTH,
      strokeDasharray: "6 4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    };

    return <path d={path} style={style} />;
  }
);

function offsetForTerminal(
  point: Point,
  position: Position,
  terminal: Multiplicity
) {
  const distance = terminal === "many" ? MARKER_GAP + CROW_LENGTH : MARKER_GAP;
  return add(point, scale(positionVector(position), distance));
}

function positionVector(position: Position): Point {
  switch (position) {
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Right:
      return { x: 1, y: 0 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    case Position.Left:
    default:
      return { x: -1, y: 0 };
  }
}

function add(first: Point, second: Point): Point {
  return { x: first.x + second.x, y: first.y + second.y };
}

function scale(point: Point, amount: number): Point {
  return { x: point.x * amount, y: point.y * amount };
}
