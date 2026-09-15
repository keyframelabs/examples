import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
  type OnReconnect,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";
import { Scan } from "lucide-react";

import {
  CanvasToolbar,
  CardinalityMenu,
  type CardinalityMenuState
} from "@/components/canvas/CanvasControls";
import { resolveCollisions } from "@/components/canvas/collisions";
import {
  createCanvasFitViewOptions,
  fitCanvasToLeft,
  type CanvasRightOcclusion
} from "@/components/canvas/fitView";
import {
  CanvasActionsContext,
  type CanvasActions
} from "@/components/canvas/flow/CanvasActionsContext";
import {
  SystemDesignConnectionLine,
  SystemDesignEdge
} from "@/components/canvas/flow/SystemDesignEdge";
import { SystemDesignNode } from "@/components/canvas/flow/SystemDesignNode";
import { useCanvasHistory } from "@/components/canvas/history";
import { serializeCanvasToText } from "@/components/canvas/serialize";
import { tableHeightForFields } from "@/components/canvas/tableLayout";
import {
  createEdge,
  createField,
  createNode,
  isTableNode,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSnapshot
} from "@/components/canvas/types";
import { parseHandleId } from "@/components/canvas/flow/handles";
import type { CanvasTool, Cardinality } from "@/components/canvas/types";

type SystemDesignCanvasProps = {
  onCanvasDirtyChange?: (isDirty: boolean) => void;
  onCanvasTextChange?: (text: string) => void;
  rightOcclusion?: CanvasRightOcclusion | null;
  toolbarEnd?: ReactNode;
};

const NODE_TYPES = { system: SystemDesignNode };
const EDGE_TYPES = { system: SystemDesignEdge };
const DEFAULT_VIEWPORT = { x: 150, y: 110, zoom: 1 };

export function SystemDesignCanvas({
  onCanvasDirtyChange,
  onCanvasTextChange,
  rightOcclusion = null,
  toolbarEnd
}: SystemDesignCanvasProps) {
  const {
    snapshot,
    update,
    updateEphemeral,
    commitFrom,
    markDirty,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty
  } = useCanvasHistory();
  const [tool, setTool] = useState<CanvasTool>("select");
  const [connectionCardinality, setConnectionCardinality] =
    useState<Cardinality>("one-to-one");
  const [autoFocusNodeId, setAutoFocusNodeId] = useState<string | null>(null);
  const [cardinalityMenu, setCardinalityMenu] =
    useState<CardinalityMenuState | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    CanvasNode,
    CanvasEdge
  > | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  // Pre-interaction snapshot; committing against it turns a whole drag,
  // resize, or text edit into a single undo entry.
  const interactionBaseRef = useRef<CanvasSnapshot | null>(null);

  useEffect(() => {
    onCanvasDirtyChange?.(isDirty);
  }, [isDirty, onCanvasDirtyChange]);

  useEffect(() => {
    if (isEditingText) return;
    onCanvasTextChange?.(serializeCanvasToText(snapshot));
  }, [isEditingText, onCanvasTextChange, snapshot]);

  const beginInteraction = useCallback(() => {
    interactionBaseRef.current ??= snapshotRef.current;
  }, []);

  const finishInteraction = useCallback(
    (settleIds?: string[]) => {
      if (settleIds) {
        updateEphemeral((current) => resolveCollisions(current, settleIds));
      }
      const base = interactionBaseRef.current;
      interactionBaseRef.current = null;
      if (base) commitFrom(base);
    },
    [commitFrom, updateEphemeral]
  );

  const handleNodesChange: OnNodesChange<CanvasNode> = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      // Removals are committed as one history entry in handleDelete.
      const applied = changes.filter((change) => change.type !== "remove");
      if (applied.length === 0) return;
      updateEphemeral((current) => ({
        ...current,
        nodes: applyNodeChanges(applied, current.nodes)
      }));
    },
    [updateEphemeral]
  );

  const handleEdgesChange: OnEdgesChange<CanvasEdge> = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      const applied = changes.filter((change) => change.type !== "remove");
      if (applied.length === 0) return;
      updateEphemeral((current) => ({
        ...current,
        edges: applyEdgeChanges(applied, current.edges)
      }));
    },
    [updateEphemeral]
  );

  const handleNodeDragStart: OnNodeDrag<CanvasNode> = useCallback(() => {
    beginInteraction();
  }, [beginInteraction]);

  const handleNodeDragStop: OnNodeDrag<CanvasNode> = useCallback(
    (event, node, draggedNodes) => {
      const dragged = draggedNodes.length > 0 ? draggedNodes : [node];
      const skipSettle = "altKey" in event && event.altKey;
      finishInteraction(
        skipSettle ? undefined : dragged.map((item) => item.id)
      );
    },
    [finishInteraction]
  );

  const handleDelete = useCallback(
    ({ nodes, edges }: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => {
      if (nodes.length === 0 && edges.length === 0) return;
      const nodeIds = new Set(nodes.map((node) => node.id));
      const edgeIds = new Set(edges.map((edge) => edge.id));
      update((current) => ({
        nodes: current.nodes.filter((node) => !nodeIds.has(node.id)),
        edges: current.edges.filter(
          (edge) =>
            !edgeIds.has(edge.id) &&
            !nodeIds.has(edge.source) &&
            !nodeIds.has(edge.target)
        )
      }));
    },
    [update]
  );

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      if (isSelfConnection(connection)) return;
      const current = snapshotRef.current;
      const source = current.nodes.find((n) => n.id === connection.source);
      const target = current.nodes.find((n) => n.id === connection.target);
      if (!source || !target) return;

      const edge = createEdge(
        connection,
        connectionCardinality,
        source.data.kind === "table" && target.data.kind === "table"
      );
      update((state) =>
        resolveCollisions({
          nodes: setSelected(state.nodes, () => false),
          edges: [
            ...setSelected(state.edges, () => false),
            { ...edge, selected: true }
          ]
        })
      );
      setTool("select");
    },
    [connectionCardinality, update]
  );

  const handleReconnect: OnReconnect<CanvasEdge> = useCallback(
    (edge, connection) => {
      if (isSelfConnection(connection)) return;
      const current = snapshotRef.current;
      const source = current.nodes.find((n) => n.id === connection.source);
      const target = current.nodes.find((n) => n.id === connection.target);
      if (!source || !target) return;

      const isTableRelationship =
        source.data.kind === "table" && target.data.kind === "table";
      update((state) => ({
        ...state,
        edges: state.edges.map((item) =>
          item.id === edge.id && item.data
            ? {
                ...item,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
                data: {
                  ...item.data,
                  isTableRelationship,
                  label: isTableRelationship ? "" : item.data.label
                }
              }
            : item
        )
      }));
      setTool("select");
    },
    [update]
  );

  const handleEditStart = useCallback(() => {
    setIsEditingText(true);
    beginInteraction();
  }, [beginInteraction]);

  const handleEditEnd = useCallback(() => {
    setIsEditingText(false);
    updateEphemeral((current) => resolveCollisions(current));
    finishInteraction();
  }, [finishInteraction, updateEphemeral]);

  const handleEditComplete = useCallback(() => {
    setAutoFocusNodeId(null);
    setCardinalityMenu(null);
    setTool("select");
  }, []);

  const handleNodeLabelChange = useCallback(
    (id: string, label: string) => {
      markDirty();
      updateEphemeral((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, label } } : node
        )
      }));
    },
    [markDirty, updateEphemeral]
  );

  const handleEdgeLabelChange = useCallback(
    (id: string, label: string) => {
      markDirty();
      updateEphemeral((current) => ({
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === id && edge.data
            ? { ...edge, data: { ...edge.data, label } }
            : edge
        )
      }));
    },
    [markDirty, updateEphemeral]
  );

  const handleFieldTextChange = useCallback(
    (tableId: string, fieldId: string, text: string) => {
      markDirty();
      updateEphemeral((current) =>
        updateTable(current, tableId, (fields) =>
          fields.map((field) =>
            field.id === fieldId ? { ...field, text } : field
          )
        )
      );
    },
    [markDirty, updateEphemeral]
  );

  const handleToggleFieldKey = useCallback(
    (tableId: string, fieldId: string, key: "primaryKey" | "foreignKey") => {
      update((current) =>
        updateTable(current, tableId, (fields) =>
          fields.map((field) =>
            field.id === fieldId ? { ...field, [key]: !field[key] } : field
          )
        )
      );
    },
    [update]
  );

  const handleAddField = useCallback(
    (tableId: string) => {
      update((current) => {
        const grown = updateTable(current, tableId, (fields) => [
          ...fields,
          createField()
        ]);
        return grown === current
          ? current
          : resolveCollisions(grown, [tableId]);
      });
    },
    [update]
  );

  const handleRemoveField = useCallback(
    (tableId: string, fieldId: string) => {
      update((current) => {
        const shrunk = updateTable(current, tableId, (fields) =>
          fields.filter((field) => field.id !== fieldId)
        );
        if (shrunk === current) return current;
        return {
          ...shrunk,
          edges: shrunk.edges.filter(
            (edge) => !edgeUsesField(edge, tableId, fieldId)
          )
        };
      });
    },
    [update]
  );

  const handleResizeEnd = useCallback(
    (id: string) => finishInteraction([id]),
    [finishInteraction]
  );

  const handleAutoFocusHandled = useCallback((id: string) => {
    setAutoFocusNodeId((current) => (current === id ? null : current));
  }, []);

  const handleEdgeDoubleClick = useCallback(
    (event: ReactMouseEvent, edge: CanvasEdge) => {
      event.preventDefault();
      if (!edge.data?.isTableRelationship) return;

      setCardinalityMenu({
        connectionId: edge.id,
        x: Math.min(event.clientX + 10, window.innerWidth - 250),
        y: Math.min(event.clientY + 10, window.innerHeight - 188)
      });
      updateEphemeral((current) => ({
        nodes: setSelected(current.nodes, () => false),
        edges: setSelected(current.edges, (id) => id === edge.id)
      }));
    },
    [updateEphemeral]
  );

  const clearSelection = useCallback(() => {
    updateEphemeral((current) => {
      const nodes = setSelected(current.nodes, () => false);
      const edges = setSelected(current.edges, () => false);
      return nodes === current.nodes && edges === current.edges
        ? current
        : { nodes, edges };
    });
  }, [updateEphemeral]);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      setCardinalityMenu(null);

      if (tool === "select" || tool === "connector") {
        clearSelection();
        return;
      }

      const point = flowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      if (!point) return;

      const node = createNode(tool, point.x - 80, point.y - 40);
      update((current) =>
        resolveCollisions(
          {
            nodes: [
              ...setSelected(current.nodes, () => false),
              { ...node, selected: true }
            ],
            edges: setSelected(current.edges, () => false)
          },
          [node.id]
        )
      );
      setAutoFocusNodeId(node.id);
      setTool("select");
    },
    [clearSelection, flowInstance, tool, update]
  );

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) =>
      !(
        connection.source === connection.target &&
        (connection.sourceHandle ?? null) === (connection.targetHandle ?? null)
      ),
    []
  );

  useEffect(() => {
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
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, redo, undo]);

  const canvasActions = useMemo<CanvasActions>(
    () => ({
      tool,
      autoFocusNodeId,
      onAutoFocusHandled: handleAutoFocusHandled,
      onEditStart: handleEditStart,
      onEditEnd: handleEditEnd,
      onEditComplete: handleEditComplete,
      onResizeStart: beginInteraction,
      onResizeEnd: handleResizeEnd,
      onNodeLabelChange: handleNodeLabelChange,
      onEdgeLabelChange: handleEdgeLabelChange,
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
      handleEdgeLabelChange,
      handleEditComplete,
      handleEditEnd,
      handleEditStart,
      handleFieldTextChange,
      handleNodeLabelChange,
      handleRemoveField,
      handleResizeEnd,
      handleToggleFieldKey,
      tool
    ]
  );

  const edges = useMemo(
    () =>
      snapshot.edges.map((edge) =>
        edge.data?.isTableRelationship
          ? edge
          : {
              ...edge,
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: edge.selected
                  ? "var(--canvas-connection-selected)"
                  : "var(--canvas-connection)"
              }
            }
      ),
    [snapshot.edges]
  );

  const fitViewOptions: FitViewOptions<CanvasNode> = useMemo(
    () => createCanvasFitViewOptions(rightOcclusion),
    [rightOcclusion]
  );

  const handleFitView = useCallback(() => {
    if (!flowInstance) return;
    void fitCanvasToLeft(flowInstance, fitViewOptions, rightOcclusion);
  }, [fitViewOptions, flowInstance, rightOcclusion]);

  const menuEdge = cardinalityMenu
    ? snapshot.edges.find((edge) => edge.id === cardinalityMenu.connectionId)
    : undefined;

  return (
    <section className="system-design-flow relative h-full min-h-[560px] select-none overflow-hidden bg-canvas-paper text-canvas-ink">
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

      <CanvasActionsContext.Provider value={canvasActions}>
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={snapshot.nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultViewport={DEFAULT_VIEWPORT}
          minZoom={0.25}
          maxZoom={2.5}
          onInit={setFlowInstance}
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
          deleteKeyCode={["Backspace", "Delete"]}
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
            showFitView={false}
            className="!bottom-4 !left-4 overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-sm"
          >
            <ControlButton
              onClick={handleFitView}
              className="react-flow__controls-fitview"
              aria-label="Fit view"
              title="Fit view"
            >
              <Scan aria-hidden="true" className="size-4" />
            </ControlButton>
          </Controls>
        </ReactFlow>
      </CanvasActionsContext.Provider>

      {cardinalityMenu && menuEdge?.data ? (
        <CardinalityMenu
          menu={cardinalityMenu}
          cardinality={menuEdge.data.cardinality}
          onSelect={(cardinality) => {
            update((current) => ({
              ...current,
              edges: current.edges.map((edge) =>
                edge.id === cardinalityMenu.connectionId && edge.data
                  ? { ...edge, data: { ...edge.data, cardinality } }
                  : edge
              )
            }));
            setCardinalityMenu(null);
          }}
          onClose={() => setCardinalityMenu(null)}
        />
      ) : null}
    </section>
  );
}

function isSelfConnection(connection: Connection): boolean {
  return (
    connection.source === connection.target &&
    connection.sourceHandle === connection.targetHandle
  );
}

function setSelected<T extends { id: string; selected?: boolean }>(
  items: T[],
  isSelected: (id: string) => boolean
): T[] {
  let changed = false;
  const next = items.map((item) => {
    const selected = isSelected(item.id);
    if ((item.selected ?? false) === selected) return item;
    changed = true;
    return { ...item, selected };
  });
  return changed ? next : items;
}

function updateTable(
  snapshot: CanvasSnapshot,
  tableId: string,
  updateFields: (
    fields: Extract<CanvasNode["data"], { kind: "table" }>["fields"]
  ) => Extract<CanvasNode["data"], { kind: "table" }>["fields"]
): CanvasSnapshot {
  const table = snapshot.nodes.find((node) => node.id === tableId);
  if (!isTableNode(table)) return snapshot;

  const fields = updateFields(table.data.fields);
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) =>
      node.id === tableId
        ? {
            ...node,
            height: Math.max(node.height ?? 0, tableHeightForFields(fields)),
            data: { ...table.data, fields }
          }
        : node
    )
  };
}

function edgeUsesField(
  edge: CanvasEdge,
  tableId: string,
  fieldId: string
): boolean {
  const sourceHandle = parseHandleId(edge.sourceHandle);
  const targetHandle = parseHandleId(edge.targetHandle);
  return (
    (edge.source === tableId &&
      "fieldId" in sourceHandle &&
      sourceHandle.fieldId === fieldId) ||
    (edge.target === tableId &&
      "fieldId" in targetHandle &&
      targetHandle.fieldId === fieldId)
  );
}
