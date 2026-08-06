import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ControlButton,
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
  type FitViewOptions,
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
import {
  geometryChanges,
  isSameFlowEndpoint,
  isTableRelationship
} from "@/components/canvas/canvasFlowHelpers";
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
  createCanvasFitViewOptions,
  fitCanvasToLeft,
  runInitialCanvasFit,
  type CanvasRightOcclusion
} from "@/components/canvas/fitView";
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
  type CanvasConnectionCardinality,
  type CanvasState,
  type CanvasTextMetadata,
  type CanvasTool
} from "@/components/canvas/model/types";
import {
  scheduleCanvasTextSerialization,
  serializeCanvasToText
} from "@/components/canvas/serializer/serializeCanvas";

type SystemDesignCanvasProps = {
  onCanvasDirtyChange?: (isDirty: boolean) => void;
  onCanvasTextChange?: (text: string, metadata: CanvasTextMetadata) => void;
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
  } = useCanvasHistory();
  const [tool, setTool] = useState<CanvasTool>("select");
  const [connectionCardinality, setConnectionCardinality] =
    useState<CanvasConnectionCardinality>("one-to-one");
  const [autoFocusNodeId, setAutoFocusNodeId] = useState<string | null>(null);
  const [cardinalityMenu, setCardinalityMenu] =
    useState<CardinalityMenuState | null>(null);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<SystemFlowNode, SystemFlowEdge> | null>(null);
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
  const isTextEditingRef = useRef(false);
  const hasHandledInitialFitRef = useRef(false);
  stateRef.current = state;

  const scheduleCanvasTextChange = useCallback(() => {
    if (
      !latestCanvasTextChangeRef.current
      || pendingCanvasTextFlushRef.current
    ) {
      return;
    }

    pendingCanvasTextFlushRef.current = scheduleCanvasTextSerialization(() => {
      pendingCanvasTextFlushRef.current = null;
      const callback = latestCanvasTextChangeRef.current;
      if (!callback) return;

      const serialized = serializeCanvasToText(latestCanvasTextStateRef.current);
      callback(serialized.text, serialized.metadata);
    });
  }, []);

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

    if (isTextEditingRef.current) {
      pendingCanvasTextFlushRef.current?.();
      pendingCanvasTextFlushRef.current = null;
      return;
    }

    scheduleCanvasTextChange();
  }, [onCanvasTextChange, scheduleCanvasTextChange, state]);

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
    isTextEditingRef.current = true;
    pendingCanvasTextFlushRef.current?.();
    pendingCanvasTextFlushRef.current = null;
    beginInteraction();
  }, [beginInteraction]);

  const handleEditEnd = useCallback(() => {
    isTextEditingRef.current = false;
    applyEphemeral({ type: "settle-collisions" });
    finishInteraction();
    scheduleCanvasTextChange();
  }, [applyEphemeral, finishInteraction, scheduleCanvasTextChange]);

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
  }, [apply, redo, undo]);

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

  const fitViewOptions: FitViewOptions<SystemFlowNode> = useMemo(
    () => createCanvasFitViewOptions(rightOcclusion),
    [rightOcclusion]
  );

  useEffect(() => {
    if (!flowInstance) return;

    runInitialCanvasFit({
      handledRef: hasHandledInitialFitRef,
      occlusion: rightOcclusion,
      expectedNodeCount: flowElements.nodes.length,
      nodes: flowInstance.getNodes(),
      fitViewOptions,
      fitView: (options) =>
        void fitCanvasToLeft(flowInstance, options, rightOcclusion)
    });
  }, [fitViewOptions, flowElements.nodes, flowInstance, rightOcclusion]);

  const handleFitView = useCallback(() => {
    const instance = flowInstanceRef.current;
    if (!instance) return;

    void fitCanvasToLeft(instance, fitViewOptions, rightOcclusion);
  }, [fitViewOptions, rightOcclusion]);

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
          setFlowInstance(instance);
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
