import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
  type OnReconnect,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  ArrowRight,
  Database,
  MousePointer2,
  Redo2,
  Square,
  Table2,
  Type,
  Undo2,
  type LucideIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";

import {
  canvasStateToFlowElements,
  flowConnectionToEndpoints,
  type FlowNodeGeometry,
  type SystemFlowEdge,
  type SystemFlowNode
} from "@/components/canvas/flow/adapters";
import {
  flowSelectionChanges,
  type CanvasSelectionChange
} from "@/components/canvas/flow/selection";
import {
  SystemDesignConnectionLine,
  SystemDesignEdge
} from "@/components/canvas/flow/SystemDesignEdge";
import { SystemDesignNode } from "@/components/canvas/flow/SystemDesignNode";
import { useCanvasHistory } from "@/components/canvas/hooks/useCanvasHistory";
import {
  createConnection,
  createField,
  createNode
} from "@/components/canvas/model/state";
import {
  isConnection,
  isNode,
  type CanvasConnection,
  type CanvasConnectionCardinality,
  type CanvasElement,
  type CanvasState,
  type CanvasTextMetadata,
  type CanvasTool
} from "@/components/canvas/model/types";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ToggleGroup,
  ToggleGroupItem
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CardinalityMenuState {
  connectionId: string;
  x: number;
  y: number;
}

export interface SystemDesignCanvasProps {
  initialState?: CanvasState;
  className?: string;
  isInteractive?: boolean;
  onCanvasChange?: (state: CanvasState) => void;
  onCanvasDirtyChange?: (isDirty: boolean) => void;
  onCanvasTextChange?: (text: string, metadata: CanvasTextMetadata) => void;
  toolbarEnd?: ReactNode;
}

const NODE_TYPES = { system: SystemDesignNode };
const EDGE_TYPES = { system: SystemDesignEdge };
const DEFAULT_VIEWPORT = { x: 150, y: 110, zoom: 1 };
const CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS = 750;
const CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS = 120;

const toolItems: Array<{
  id: CanvasTool;
  label: string;
  icon: LucideIcon;
}> = [
    { id: "select", label: "Select", icon: MousePointer2 },
    { id: "service", label: "Service", icon: Square },
    { id: "database", label: "Database", icon: Database },
    { id: "table", label: "Table", icon: Table2 },
    { id: "text", label: "Text", icon: Type },
    { id: "connector", label: "Connector", icon: ArrowRight }
  ];

const cardinalityItems: Array<{
  id: CanvasConnectionCardinality;
  label: string;
  shortLabel: string;
}> = [
    { id: "one-to-one", label: "One to one", shortLabel: "1:1" },
    { id: "one-to-many", label: "One to many", shortLabel: "1:N" },
    { id: "many-to-one", label: "Many to one", shortLabel: "N:1" },
    { id: "many-to-many", label: "Many to many", shortLabel: "N:N" }
  ];

export function SystemDesignCanvas({
  initialState,
  className = "",
  isInteractive = true,
  onCanvasChange,
  onCanvasDirtyChange,
  onCanvasTextChange,
  toolbarEnd
}: SystemDesignCanvasProps) {
  const {
    state,
    apply,
    applyEphemeral,
    commitSnapshot,
    markDirty,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty
  } = useCanvasHistory(initialState);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [connectionCardinality, setConnectionCardinality] =
    useState<CanvasConnectionCardinality>("one-to-one");
  const [autoFocusNodeId, setAutoFocusNodeId] = useState<string | null>(null);
  const [cardinalityMenu, setCardinalityMenu] =
    useState<CardinalityMenuState | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const flowInstanceRef =
    useRef<ReactFlowInstance<SystemFlowNode, SystemFlowEdge> | null>(null);
  const interactionSnapshotRef = useRef<CanvasState | null>(null);
  const pendingSelectionChangesRef = useRef(new Map<string, boolean>());
  const selectionFlushQueuedRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRef = useRef(state);
  const pendingCanvasTextFlushRef = useRef<(() => void) | null>(null);
  const latestCanvasTextStateRef = useRef(state);
  const latestCanvasTextChangeRef = useRef(onCanvasTextChange);
  stateRef.current = state;

  useEffect(() => {
    onCanvasChange?.(state);
  }, [onCanvasChange, state]);

  useEffect(() => {
    onCanvasDirtyChange?.(isDirty);
  }, [isDirty, onCanvasDirtyChange]);

  useEffect(() => {
    latestCanvasTextStateRef.current = state;
    latestCanvasTextChangeRef.current = onCanvasTextChange;

    if (!onCanvasTextChange) {
      pendingCanvasTextFlushRef.current?.();
      pendingCanvasTextFlushRef.current = null;
      return;
    }

    if (pendingCanvasTextFlushRef.current) return;

    pendingCanvasTextFlushRef.current = scheduleCanvasTextSerialization(() => {
      pendingCanvasTextFlushRef.current = null;
      const callback = latestCanvasTextChangeRef.current;
      if (!callback) return;

      const serialized = serializeCanvasToText(latestCanvasTextStateRef.current);
      callback(serialized.text, serialized.metadata);
    });
  }, [onCanvasTextChange, state]);

  useEffect(() => {
    mountedRef.current = true;
    applyEphemeral({ type: "settle-collisions" });
    return () => {
      mountedRef.current = false;
      pendingCanvasTextFlushRef.current?.();
      pendingCanvasTextFlushRef.current = null;
    };
  }, [applyEphemeral]);

  const beginInteraction = useCallback(() => {
    interactionSnapshotRef.current ??= stateRef.current;
  }, []);

  const finishInteraction = useCallback(
    (
      geometries: FlowNodeGeometry[] = [],
      settleIds: string[] = [],
      skipSettling = false
    ) => {
      if (geometries.length > 0) {
        applyEphemeral({ type: "update-node-geometries", geometries });
      }
      if (!skipSettling && settleIds.length > 0) {
        applyEphemeral({ type: "settle-collisions", pinnedIds: settleIds });
      }

      const snapshot = interactionSnapshotRef.current;
      interactionSnapshotRef.current = null;
      if (snapshot) commitSnapshot(snapshot);
    },
    [applyEphemeral, commitSnapshot]
  );

  const handleResizeEnd = useCallback(
    (geometry: FlowNodeGeometry) =>
      finishInteraction([geometry], [geometry.id]),
    [finishInteraction]
  );

  const queueSelectionChanges = useCallback(
    (changes: CanvasSelectionChange[]) => {
      if (changes.length === 0) return;

      for (const change of changes) {
        pendingSelectionChangesRef.current.set(change.id, change.selected);
      }
      if (selectionFlushQueuedRef.current) return;

      selectionFlushQueuedRef.current = true;
      queueMicrotask(() => {
        selectionFlushQueuedRef.current = false;
        const queued = Array.from(
          pendingSelectionChangesRef.current,
          ([id, selected]) => ({ id, selected })
        );
        pendingSelectionChangesRef.current.clear();
        if (mountedRef.current && queued.length > 0) {
          apply({ type: "change-selection", changes: queued });
        }
      });
    },
    [apply]
  );

  const handleNodesChange: OnNodesChange<SystemFlowNode> = useCallback(
    (changes: NodeChange<SystemFlowNode>[]) => {
      queueSelectionChanges(flowSelectionChanges(changes, []));
      const geometries = geometryChanges(changes, stateRef.current);
      if (geometries.length > 0) {
        applyEphemeral({ type: "update-node-geometries", geometries });
      }
    },
    [applyEphemeral, queueSelectionChanges]
  );

  const handleEdgesChange: OnEdgesChange<SystemFlowEdge> = useCallback(
    (changes: EdgeChange<SystemFlowEdge>[]) => {
      queueSelectionChanges(flowSelectionChanges([], changes));
    },
    [queueSelectionChanges]
  );

  const handleNodeDragStart: OnNodeDrag<SystemFlowNode> = useCallback(() => {
    beginInteraction();
  }, [beginInteraction]);

  const handleNodeDragStop: OnNodeDrag<SystemFlowNode> = useCallback(
    (event, node, draggedNodes) => {
      const finalNodes = draggedNodes.length > 0 ? draggedNodes : [node];
      finishInteraction(
        finalNodes.map((item) => ({
          id: item.id,
          x: item.position.x,
          y: item.position.y
        })),
        finalNodes.map((item) => item.id),
        "altKey" in event && event.altKey
      );
    },
    [finishInteraction]
  );

  const handleDelete = useCallback(
    ({
      nodes,
      edges
    }: {
      nodes: SystemFlowNode[];
      edges: SystemFlowEdge[];
    }) => {
      const ids = [
        ...nodes.map((node) => node.id),
        ...edges.map((edge) => edge.id)
      ];
      if (ids.length > 0) apply({ type: "delete-elements", ids });
    },
    [apply]
  );

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      if (isSameFlowEndpoint(connection)) return;
      const current = stateRef.current;
      const from = current.elements[connection.source];
      const to = current.elements[connection.target];
      if (!isNode(from) || !isNode(to)) return;

      const endpoints = flowConnectionToEndpoints(connection);
      apply({
        type: "add-connection",
        connection: createConnection(
          connection.source,
          connection.target,
          "",
          {
            fromFieldId: endpoints.from.fieldId,
            toFieldId: endpoints.to.fieldId,
            fromAnchor: endpoints.from.anchor,
            toAnchor: endpoints.to.anchor,
            fromFieldSide: endpoints.from.fieldSide,
            toFieldSide: endpoints.to.fieldSide,
            cardinality: connectionCardinality
          }
        ),
        select: true
      });
      setTool("select");
    },
    [apply, connectionCardinality]
  );

  const handleReconnect: OnReconnect<SystemFlowEdge> = useCallback(
    (flowEdge, connection) => {
      if (isSameFlowEndpoint(connection)) return;
      const current = stateRef.current;
      const canvasConnection = current.elements[flowEdge.id];
      const from = current.elements[connection.source];
      const to = current.elements[connection.target];
      if (!isConnection(canvasConnection) || !isNode(from) || !isNode(to)) {
        return;
      }

      const endpoints = flowConnectionToEndpoints(connection);
      apply({
        type: "update-element",
        id: canvasConnection.id,
        patch: {
          fromId: connection.source,
          toId: connection.target,
          fromFieldId: endpoints.from.fieldId,
          toFieldId: endpoints.to.fieldId,
          fromAnchor: endpoints.from.anchor,
          toAnchor: endpoints.to.anchor,
          fromFieldSide: endpoints.from.fieldSide,
          toFieldSide: endpoints.to.fieldSide,
          label:
            from.kind === "table" && to.kind === "table"
              ? ""
              : canvasConnection.label
        }
      });
      setTool("select");
    },
    [apply]
  );

  const handleEditStart = useCallback(() => {
    beginInteraction();
  }, [beginInteraction]);

  const handleEditEnd = useCallback(() => {
    applyEphemeral({ type: "settle-collisions" });
    finishInteraction();
  }, [applyEphemeral, finishInteraction]);

  const handleEditComplete = useCallback(() => {
    setAutoFocusNodeId(null);
    setCardinalityMenu(null);
    setTool("select");
  }, []);

  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      markDirty();
      applyEphemeral({ type: "update-element", id, patch: { label } });
    }, [applyEphemeral, markDirty]
  );

  const handleFieldTextChange = useCallback(
    (tableId: string, fieldId: string, text: string) => {
      const table = stateRef.current.elements[tableId];
      if (!table || table.kind !== "table") return;
      markDirty();
      applyEphemeral({
        type: "update-element",
        id: tableId,
        patch: {
          fields: table.fields.map((field) =>
            field.id === fieldId ? { ...field, text } : field
          )
        }
      });
    },
    [applyEphemeral, markDirty]
  );

  const handleToggleFieldKey = useCallback(
    (
      tableId: string,
      fieldId: string,
      key: "primaryKey" | "foreignKey"
    ) => {
      const table = stateRef.current.elements[tableId];
      if (!table || table.kind !== "table") return;
      apply({
        type: "update-element",
        id: tableId,
        patch: {
          fields: table.fields.map((field) =>
            field.id === fieldId
              ? { ...field, [key]: !field[key] }
              : field
          )
        }
      });
    },
    [apply]
  );

  const handleAddField = useCallback(
    (tableId: string) => {
      const table = stateRef.current.elements[tableId];
      if (!table || table.kind !== "table") return;
      apply({
        type: "update-element",
        id: tableId,
        patch: { fields: [...table.fields, createField()] }
      });
    },
    [apply]
  );

  const handleRemoveField = useCallback(
    (tableId: string, fieldId: string) => {
      const table = stateRef.current.elements[tableId];
      if (!table || table.kind !== "table") return;
      apply({
        type: "remove-table-field",
        tableId,
        fieldId
      });
    },
    [apply]
  );

  const handleAutoFocusHandled = useCallback((id: string) => {
    setAutoFocusNodeId((current) => (current === id ? null : current));
  }, []);

  const handleEdgeDoubleClick = useCallback(
    (event: ReactMouseEvent, edge: SystemFlowEdge) => {
      event.preventDefault();
      const connection = stateRef.current.elements[edge.id];
      if (!isConnection(connection)) return;
      const from = stateRef.current.elements[connection.fromId];
      const to = stateRef.current.elements[connection.toId];

      if (isNode(from) && isNode(to) && isTableRelationship(from, to)) {
        setCardinalityMenu({
          connectionId: connection.id,
          x: Math.min(event.clientX + 10, window.innerWidth - 250),
          y: Math.min(event.clientY + 10, window.innerHeight - 188)
        });
        apply({ type: "select", ids: [connection.id] });
        return;
      }
    },
    [apply]
  );

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      setCardinalityMenu(null);

      if (tool === "select" || tool === "connector") {
        if (stateRef.current.selectedIds.length > 0) {
          apply({ type: "clear-selection" });
        }
        return;
      }

      const flowPoint = flowInstanceRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      if (!flowPoint) return;

      const node = createNode(tool, flowPoint.x - 80, flowPoint.y - 40);
      apply({ type: "add-node", node, select: true });
      setAutoFocusNodeId(node.id);
      setTool("select");
    },
    [apply, tool]
  );

  const isValidConnection = useCallback(
    (connection: Connection | SystemFlowEdge) =>
      !(
        connection.source === connection.target &&
        (connection.sourceHandle ?? null) === (connection.targetHandle ?? null)
      ),
    []
  );

  useEffect(() => {
    if (!isInteractive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape") {
        setAutoFocusNodeId(null);
        setCardinalityMenu(null);
        setTool("select");
        if (stateRef.current.selectedIds.length > 0) {
          apply({ type: "clear-selection" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apply, isInteractive, redo, undo]);

  const flowElements = useMemo(
    () =>
      canvasStateToFlowElements(state, {
        tool,
        autoFocusNodeId,
        onResizeStart: beginInteraction,
        onResizeEnd: handleResizeEnd,
        onEditStart: handleEditStart,
        onEditEnd: handleEditEnd,
        onEditComplete: handleEditComplete,
        onAutoFocusHandled: handleAutoFocusHandled,
        onLabelChange: handleLabelChange,
        onFieldTextChange: handleFieldTextChange,
        onToggleFieldKey: handleToggleFieldKey,
        onAddField: handleAddField,
        onRemoveField: handleRemoveField
      }),
    [
      autoFocusNodeId,
      beginInteraction,
      handleAddField,
      handleAutoFocusHandled,
      handleEditEnd,
      handleEditComplete,
      handleEditStart,
      handleFieldTextChange,
      handleLabelChange,
      handleRemoveField,
      handleResizeEnd,
      handleToggleFieldKey,
      state,
      tool
    ]
  );

  return (
    <section
      ref={rootRef}
      className={cn(
        "system-design-flow relative h-full min-h-[560px] select-none overflow-hidden bg-canvas-paper text-canvas-ink",
        className
      )}
    >
      <CanvasToolbar
        tool={tool}
        canUndo={canUndo}
        canRedo={canRedo}
        connectionCardinality={connectionCardinality}
        onToolChange={setTool}
        onCardinalityChange={setConnectionCardinality}
        onUndo={undo}
        onRedo={redo}
        toolbarEnd={toolbarEnd}
      />

      <ReactFlow<SystemFlowNode, SystemFlowEdge>
        nodes={flowElements.nodes}
        edges={flowElements.edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.25}
        maxZoom={2.5}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onDelete={handleDelete}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onPaneClick={handlePaneClick}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={SystemDesignConnectionLine}
        connectionLineStyle={{ stroke: "var(--primary)" }}
        nodesDraggable={tool === "select"}
        nodesConnectable
        edgesReconnectable={tool === "select" || tool === "connector"}
        elementsSelectable
        panOnDrag={tool === "select"}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Meta", "Control"]}
        zoomOnDoubleClick={false}
        connectOnClick
        deleteKeyCode={isInteractive ? ["Backspace", "Delete"] : null}
        disableKeyboardA11y={!isInteractive}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionKeyCode="Shift"
        attributionPosition="bottom-right"
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--canvas-grid-dot)"
          gap={24}
          size={2}
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!bottom-4 !left-4 overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-sm"
        />
      </ReactFlow>

      {cardinalityMenu ? (
        <CardinalityMenu
          menu={cardinalityMenu}
          connection={state.elements[cardinalityMenu.connectionId]}
          onSelect={(cardinality) => {
            apply({
              type: "update-element",
              id: cardinalityMenu.connectionId,
              patch: { cardinality }
            });
            setCardinalityMenu(null);
          }}
          onClose={() => setCardinalityMenu(null)}
        />
      ) : null}
    </section>
  );
}

function CanvasToolbar({
  tool,
  canUndo,
  canRedo,
  connectionCardinality,
  onToolChange,
  onCardinalityChange,
  onUndo,
  onRedo,
  toolbarEnd
}: {
  tool: CanvasTool;
  canUndo: boolean;
  canRedo: boolean;
  connectionCardinality: CanvasConnectionCardinality;
  onToolChange: (tool: CanvasTool) => void;
  onCardinalityChange: (cardinality: CanvasConnectionCardinality) => void;
  onUndo: () => void;
  onRedo: () => void;
  toolbarEnd?: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Card className="absolute left-4 top-4 z-20 flex items-center gap-2 bg-card/95 p-1 backdrop-blur-sm">
        <ToggleGroup
          type="single"
          value={tool}
          onValueChange={(nextTool) =>
            onToolChange((nextTool || "select") as CanvasTool)
          }
        >
          {toolItems.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value={item.id}
                      aria-label={item.label}
                      size="icon"
                    >
                      <Icon size={18} />
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-1 h-7" />
        <ToolbarButton
          label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          icon={<Undo2 size={18} />}
        />
        <ToolbarButton
          label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          icon={<Redo2 size={18} />}
        />
        {toolbarEnd ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-7" />
            {toolbarEnd}
          </>
        ) : null}
      </Card>

      {tool === "connector" ? (
        <Card className="absolute left-4 top-[72px] z-20 flex items-center gap-2 bg-card/95 p-1 backdrop-blur-sm">
          <ToggleGroup
            type="single"
            value={connectionCardinality}
            onValueChange={(nextCardinality) => {
              if (nextCardinality) {
                onCardinalityChange(
                  nextCardinality as CanvasConnectionCardinality
                );
              }
            }}
          >
            {cardinalityItems.map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value={item.id}
                      aria-label={item.label}
                      size="sm"
                      className="min-w-10 tabular-nums"
                    >
                      {item.shortLabel}
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </Card>
      ) : null}
    </TooltipProvider>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  icon
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          disabled={disabled}
          variant="ghost"
          size="icon"
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CardinalityMenu({
  menu,
  connection,
  onSelect,
  onClose
}: {
  menu: CardinalityMenuState;
  connection: CanvasElement | undefined;
  onSelect: (cardinality: CanvasConnectionCardinality) => void;
  onClose: () => void;
}) {
  if (!isConnection(connection)) return null;

  return (
    <Card
      className="fixed z-40 w-[232px] bg-card/95 p-2 backdrop-blur-sm"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Relationship
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-xs"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <ToggleGroup
        type="single"
        value={connection.cardinality ?? "one-to-one"}
        onValueChange={(nextCardinality) => {
          if (nextCardinality) {
            onSelect(nextCardinality as CanvasConnectionCardinality);
          }
        }}
        className="grid grid-cols-2 gap-1"
      >
        {cardinalityItems.map((item) => (
          <ToggleGroupItem
            key={item.id}
            value={item.id}
            size="sm"
            title={item.label}
            aria-label={item.label}
            className="justify-center tabular-nums"
          >
            {item.shortLabel}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Card>
  );
}

function geometryChanges(
  changes: NodeChange<SystemFlowNode>[],
  state: CanvasState
): FlowNodeGeometry[] {
  const byId = new Map<string, FlowNodeGeometry>();

  for (const change of changes) {
    if (change.type !== "position" && change.type !== "dimensions") continue;
    const element = state.elements[change.id];
    if (!isNode(element)) continue;
    const geometry = byId.get(change.id) ?? {
      id: change.id,
      x: element.x,
      y: element.y
    };

    if (change.type === "position" && change.position) {
      geometry.x = change.position.x;
      geometry.y = change.position.y;
    }
    if (change.type === "dimensions" && change.dimensions) {
      geometry.width = change.dimensions.width;
      geometry.height = change.dimensions.height;
    }
    byId.set(change.id, geometry);
  }

  return [...byId.values()];
}

function isSameFlowEndpoint(connection: Connection): boolean {
  return (
    connection.source === connection.target &&
    connection.sourceHandle === connection.targetHandle
  );
}

function isTableRelationship(
  from: Exclude<CanvasElement, CanvasConnection>,
  to: Exclude<CanvasElement, CanvasConnection>
) {
  return from.kind === "table" && to.kind === "table";
}

function scheduleCanvasTextSerialization(callback: () => void): () => void {
  if (typeof window === "undefined") {
    const handle = globalThis.setTimeout(callback, 0);
    return () => globalThis.clearTimeout(handle);
  }

  const idleScheduler = window as unknown as {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleScheduler.requestIdleCallback === "function") {
    const handle = idleScheduler.requestIdleCallback(callback, {
      timeout: CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS
    });
    return () => idleScheduler.cancelIdleCallback?.(handle);
  }

  const handle = globalThis.setTimeout(
    callback,
    CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS
  );
  return () => globalThis.clearTimeout(handle);
}
