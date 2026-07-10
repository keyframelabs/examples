import {
  ArrowRight,
  Crosshair,
  Database,
  MousePointer2,
  Redo2,
  Square,
  Table2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { useCanvasHistory } from "@/components/canvas/hooks/useCanvasHistory";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP,
  TABLE_HEADER_HEIGHT,
  createConnection,
  createNode,
  parseTableEditorValue
} from "@/components/canvas/model/state";
import {
  isConnection,
  isNode,
  type CanvasConnectionCardinality,
  type CanvasConnection,
  type CanvasElement,
  type CanvasFieldSide,
  type CanvasField,
  type CanvasNodeAnchor,
  type CanvasNode,
  type CanvasState,
  type CanvasTableNode,
  type CanvasTextMetadata,
  type CanvasTool
} from "@/components/canvas/model/types";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";

interface Point {
  x: number;
  y: number;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

type Interaction =
  | {
      type: "pan";
      pointerId: number;
      startClient: Point;
      startViewport: Viewport;
    }
  | {
      type: "drag";
      pointerId: number;
      lastWorld: Point;
      ids: string[];
      snapshot: CanvasState;
    }
  | {
      type: "resize";
      pointerId: number;
      id: string;
      startWorld: Point;
      startSize: { width: number; height: number };
      snapshot: CanvasState;
    }
  | {
      type: "connection-endpoint";
      pointerId: number;
      connectionId: string;
      end: ConnectionEnd;
      snapshot: CanvasState;
    }
  | {
      type: "connection-create";
      pointerId: number;
      source: ConnectionEndpoint;
      startWorld: Point;
    };

interface EditingState {
  id: string;
  value: string;
  anchor?: Point;
}

interface CanvasEditEvent {
  clientX: number;
  clientY: number;
}

interface PointerPressState {
  id: string;
  client: Point;
  timestamp: number;
}

interface CardinalityMenuState {
  connectionId: string;
  x: number;
  y: number;
}

interface ConnectionEndpoint {
  nodeId: string;
  fieldId?: string;
  anchor?: CanvasNodeAnchor;
  fieldSide?: CanvasFieldSide;
}

type AnchorSide = "top" | "right" | "bottom" | "left";

interface EndpointAnchor {
  point: Point;
  side: AnchorSide;
}

type EndpointMultiplicity =
  | "one"
  | "many";

type ConnectionEnd = "from" | "to";

interface ConnectionDragState {
  connectionId: string;
  end: ConnectionEnd;
  world: Point;
  hoverEndpoint?: ConnectionEndpoint;
}

interface ConnectionCreateDragState {
  source: ConnectionEndpoint;
  world: Point;
  hoverEndpoint?: ConnectionEndpoint;
  didDrag: boolean;
}

interface AttachmentPoint {
  id: string;
  point: Point;
  endpoint: ConnectionEndpoint;
}

type EndpointPointerDownHandler = (
  event: ReactPointerEvent<Element>,
  endpoint: ConnectionEndpoint
) => void;

export interface SystemDesignCanvasProps {
  initialState?: CanvasState;
  readonly?: boolean;
  className?: string;
  onCanvasChange?: (state: CanvasState) => void;
  onCanvasTextChange?: (text: string, metadata: CanvasTextMetadata) => void;
}

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

const CONNECTOR_LEAD = 32;
const CONNECTOR_CORNER_RADIUS = 12;
const ERD_MARKER_GAP = 6;
const ERD_MARKER_HEIGHT = 16;
const ERD_CIRCLE_RADIUS = 6;
const ERD_CROW_LENGTH = 16;
const ERD_CROW_SPREAD = 8;
const ATTACHMENT_HIT_RADIUS = 18;
const ATTACHMENT_POINT_RADIUS = 4.5;
const DOUBLE_CLICK_MAX_MS = 420;
const DOUBLE_CLICK_MAX_DISTANCE = 8;
const CANVAS_TEXT_SERIALIZATION_TIMEOUT_MS = 750;
const CANVAS_TEXT_SERIALIZATION_FALLBACK_DELAY_MS = 120;

const themeToken = (name: string) => `hsl(var(${name}))`;
const CANVAS_PRIMARY = themeToken("--primary");
const CANVAS_ACCENT = themeToken("--accent");
const CANVAS_CARD = themeToken("--card");
const CANVAS_CONNECTION = themeToken("--canvas-connection");
const CANVAS_CONNECTION_SELECTED = themeToken("--canvas-connection-selected");

const nodeAnchors: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left"
];

const tableNodeAnchors: CanvasNodeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "bottom-right",
  "bottom",
  "bottom-left"
];

const nodeFill: Record<CanvasNode["kind"], string> = {
  actor: themeToken("--canvas-node-actor"),
  service: themeToken("--canvas-node-service"),
  database: themeToken("--canvas-node-database"),
  table: themeToken("--canvas-node-table"),
  text: "transparent"
};

const nodeStroke: Record<CanvasNode["kind"], string> = {
  actor: themeToken("--canvas-node-actor-foreground"),
  service: themeToken("--canvas-node-service-foreground"),
  database: themeToken("--canvas-node-database-foreground"),
  table: themeToken("--canvas-node-table-foreground"),
  text: themeToken("--canvas-node-text")
};

export function SystemDesignCanvas({
  initialState,
  readonly = false,
  className = "",
  onCanvasChange,
  onCanvasTextChange
}: SystemDesignCanvasProps) {
  const {
    state,
    apply,
    applyEphemeral,
    commitSnapshot,
    undo,
    redo,
    canUndo,
    canRedo
  } = useCanvasHistory(initialState);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [viewport, setViewport] = useState<Viewport>({
    x: 150,
    y: 110,
    zoom: 1
  });
  const [connectorSource, setConnectorSource] =
    useState<ConnectionEndpoint | null>(null);
  const [connectionCardinality, setConnectionCardinality] =
    useState<CanvasConnectionCardinality>("one-to-one");
  const [connectionDrag, setConnectionDrag] =
    useState<ConnectionDragState | null>(null);
  const [connectionCreateDrag, setConnectionCreateDrag] =
    useState<ConnectionCreateDragState | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [cardinalityMenu, setCardinalityMenu] =
    useState<CardinalityMenuState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const lastPointerPressRef = useRef<PointerPressState | null>(null);
  const pendingCanvasTextFlushRef = useRef<(() => void) | null>(null);
  const latestCanvasTextStateRef = useRef(state);
  const latestCanvasTextChangeRef = useRef(onCanvasTextChange);

  const { nodes, connections } = useMemo(
    () => {
      const nextNodes: CanvasNode[] = [];
      const nextConnections: CanvasConnection[] = [];

      for (const id of state.order) {
        const element = state.elements[id];
        if (!element) continue;

        if (isNode(element)) {
          nextNodes.push(element);
        } else if (isConnection(element)) {
          nextConnections.push(element);
        }
      }

      return { nodes: nextNodes, connections: nextConnections };
    },
    [state.elements, state.order]
  );
  const selectedIdSet = useMemo(
    () => new Set(state.selectedIds),
    [state.selectedIds]
  );

  useEffect(() => {
    onCanvasChange?.(state);
  }, [onCanvasChange, state]);

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
    return () => {
      pendingCanvasTextFlushRef.current?.();
      pendingCanvasTextFlushRef.current = null;
    };
  }, []);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      return {
        x: (clientX - left - viewport.x) / viewport.zoom,
        y: (clientY - top - viewport.y) / viewport.zoom
      };
    },
    [viewport]
  );

  const worldToScreen = useCallback(
    (point: Point): Point => ({
      x: point.x * viewport.zoom + viewport.x,
      y: point.y * viewport.zoom + viewport.y
    }),
    [viewport]
  );

  const clientToSurfacePoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0)
    };
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      setViewport((current) => {
        const clampedZoom = clamp(nextZoom, 0.25, 2.5);
        const worldX = (clientX - left - current.x) / current.zoom;
        const worldY = (clientY - top - current.y) / current.zoom;
        return {
          x: clientX - left - worldX * clampedZoom,
          y: clientY - top - worldY * clampedZoom,
          zoom: clampedZoom
        };
      });
    },
    []
  );

  const commitEditing = useCallback(() => {
    if (!editing) return;
    const element = state.elements[editing.id];
    if (!element) {
      setEditing(null);
      return;
    }

    if (element.kind === "table") {
      const { label, fields } = parseTableEditorValue(
        editing.value,
        element.fields
      );
      apply({ type: "update-element", id: element.id, patch: { label, fields } });
    } else {
      apply({
        type: "update-element",
        id: element.id,
        patch: { label: editing.value.trim() || element.label }
      });
    }
    setEditing(null);
  }, [apply, editing, state.elements]);

  const startEditing = useCallback(
    (id: string, anchor?: Point) => {
      if (readonly) return;
      const element = state.elements[id];
      if (!element) return;
      setCardinalityMenu(null);
      if (element.kind === "table") {
        setEditing({
          id,
          value: [element.label, ...element.fields.map((field) => field.text)].join(
            "\n"
          ),
          anchor
        });
      } else {
        setEditing({ id, value: element.label, anchor });
      }
      apply({ type: "select", ids: [id] });
    },
    [apply, readonly, state.elements]
  );

  const handleConnectionDoubleAction = useCallback(
    (clientX: number, clientY: number, connection: CanvasConnection) => {
      if (readonly) return;
      const from = state.elements[connection.fromId];
      const to = state.elements[connection.toId];
      apply({ type: "select", ids: [connection.id] });

      if (isNode(from) && isNode(to) && isTableRelationship(from, to)) {
        setEditing(null);
        setCardinalityMenu({
          connectionId: connection.id,
          x: Math.min(clientX + 10, window.innerWidth - 250),
          y: Math.min(clientY + 10, window.innerHeight - 188)
        });
        return;
      }

      setCardinalityMenu(null);
      startEditing(connection.id, clientToSurfacePoint(clientX, clientY));
    },
    [apply, clientToSurfacePoint, readonly, startEditing, state.elements]
  );

  const handleConnectionDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGGElement>, connection: CanvasConnection) => {
      event.stopPropagation();
      handleConnectionDoubleAction(event.clientX, event.clientY, connection);
    },
    [handleConnectionDoubleAction]
  );

  const handleCanvasDoubleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (readonly) return;
      if (!(event.target instanceof Element)) return;

      const canvasObject = event.target.closest(
        '[data-canvas-object="connection"], [data-canvas-object="node"]'
      );
      const id = canvasObject?.getAttribute("data-canvas-id");
      const element = id ? state.elements[id] : undefined;
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();

      if (element.kind === "connection") {
        handleConnectionDoubleAction(event.clientX, event.clientY, element);
        return;
      }

      startEditing(
        element.id,
        clientToSurfacePoint(event.clientX, event.clientY)
      );
    },
    [
      clientToSurfacePoint,
      handleConnectionDoubleAction,
      readonly,
      startEditing,
      state.elements
    ]
  );

  const addConnectionBetweenEndpoints = useCallback(
    (source: ConnectionEndpoint, target: ConnectionEndpoint): boolean => {
      const sourceElement = state.elements[source.nodeId];
      const targetElement = state.elements[target.nodeId];
      if (
        !isNode(sourceElement) ||
        !isNode(targetElement) ||
        sameEndpoint(source, target)
      ) {
        return false;
      }

      const label = connectionLabelForEndpoints(
        sourceElement,
        targetElement,
        source,
        target
      );

      apply({
        type: "add-connection",
        connection: createConnection(source.nodeId, target.nodeId, label, {
          fromFieldId: source.fieldId,
          toFieldId: target.fieldId,
          fromAnchor: source.anchor,
          toAnchor: target.anchor,
          fromFieldSide: source.fieldSide,
          toFieldSide: target.fieldSide,
          cardinality: connectionCardinality
        }),
        select: true
      });

      return true;
    },
    [apply, connectionCardinality, state.elements]
  );

  const handleConnectorEndpointClick = useCallback(
    (endpoint: ConnectionEndpoint) => {
      if (readonly) return;
      const element = state.elements[endpoint.nodeId];
      if (!isNode(element)) return;

      apply({ type: "select", ids: [endpoint.nodeId] });

      if (!connectorSource) {
        setConnectorSource(endpoint);
        return;
      }

      if (!sameEndpoint(connectorSource, endpoint)) {
        addConnectionBetweenEndpoints(connectorSource, endpoint);
      }

      setConnectorSource(null);
      setTool("select");
    },
    [
      addConnectionBetweenEndpoints,
      connectorSource,
      readonly,
      state.elements
    ]
  );

  const setPointerCapture = (pointerId: number) => {
    svgRef.current?.setPointerCapture(pointerId);
  };

  const handleConnectorEndpointPointerDown: EndpointPointerDownHandler = (
    event,
    endpoint
  ) => {
    event.stopPropagation();
    if (readonly || event.button !== 0) return;
    event.preventDefault();

    const element = state.elements[endpoint.nodeId];
    if (!isNode(element)) return;

    const world = screenToWorld(event.clientX, event.clientY);
    setPointerCapture(event.pointerId);
    setConnectionCreateDrag({
      source: endpoint,
      world,
      didDrag: false
    });
    interactionRef.current = {
      type: "connection-create",
      pointerId: event.pointerId,
      source: endpoint,
      startWorld: world
    };
  };

  const handleBackgroundPointerDown = (
    event: ReactPointerEvent<SVGSVGElement>
  ) => {
    if (readonly || event.button !== 0) return;
    event.preventDefault();
    setCardinalityMenu(null);

    const world = screenToWorld(event.clientX, event.clientY);

    if (tool === "select") {
      apply({ type: "clear-selection" });
      setEditing(null);
      setIsPanning(true);
      setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "pan",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewport
      };
      return;
    }

    if (tool === "connector") {
      setConnectorSource(null);
      setConnectionCreateDrag(null);
      return;
    }

    const node = createNode(tool, world.x - 80, world.y - 40);
    apply({ type: "add-node", node, select: true });
    setConnectorSource(null);
    setTool("select");
    if (node.kind === "table") {
      setEditing({
        id: node.id,
        value: [node.label, ...node.fields.map((field) => field.text)].join("\n"),
        anchor: clientToSurfacePoint(event.clientX, event.clientY)
      });
    } else if (node.kind === "text") {
      setEditing({
        id: node.id,
        value: node.label,
        anchor: clientToSurfacePoint(event.clientX, event.clientY)
      });
    }
  };

  const handleElementPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    element: CanvasElement
  ) => {
    event.stopPropagation();
    if (readonly || event.button !== 0) return;
    setCardinalityMenu(null);

    if (isDoublePointerPress(element.id, event, lastPointerPressRef)) {
      event.preventDefault();
      interactionRef.current = null;
      lastPointerPressRef.current = null;

      if (element.kind === "connection") {
        handleConnectionDoubleAction(event.clientX, event.clientY, element);
        return;
      }

      startEditing(
        element.id,
        clientToSurfacePoint(event.clientX, event.clientY)
      );
      return;
    }

    if (element.kind === "connection") {
      if (event.detail >= 2) {
        handleConnectionDoubleAction(event.clientX, event.clientY, element);
        return;
      }
      apply({ type: "select", ids: [element.id] });
      return;
    }

    event.preventDefault();

    if (event.detail >= 2) {
      startEditing(
        element.id,
        clientToSurfacePoint(event.clientX, event.clientY)
      );
      return;
    }

    if (tool === "connector") {
      const world = screenToWorld(event.clientX, event.clientY);
      const attachment =
        nearestAttachmentPointForNode(element, world) ??
        nearestAttachmentPoint(world, [element]);
      handleConnectorEndpointPointerDown(
        event,
        attachment?.endpoint ?? {
          nodeId: element.id,
          anchor: nearestNodeAnchor(element, world)
        }
      );
      return;
    }

    const isSelected = selectedIdSet.has(element.id);
    const ids = isSelected
      ? state.selectedIds
      : [element.id];
    if (!isSelected) {
      apply({ type: "select", ids });
    }

    setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "drag",
      pointerId: event.pointerId,
      lastWorld: screenToWorld(event.clientX, event.clientY),
      ids,
      snapshot: state
    };
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent<SVGRectElement>,
    node: CanvasNode
  ) => {
    event.stopPropagation();
    if (readonly) return;
    event.preventDefault();
    setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "resize",
      pointerId: event.pointerId,
      id: node.id,
      startWorld: screenToWorld(event.clientX, event.clientY),
      startSize: { width: node.width, height: node.height },
      snapshot: state
    };
  };

  const handleConnectionEndpointPointerDown = (
    event: ReactPointerEvent<SVGCircleElement>,
    connection: CanvasConnection,
    end: ConnectionEnd
  ) => {
    event.stopPropagation();
    event.preventDefault();
    if (readonly || event.button !== 0) return;

    const world = screenToWorld(event.clientX, event.clientY);
    apply({ type: "select", ids: [connection.id] });
    setPointerCapture(event.pointerId);
    setConnectionDrag({
      connectionId: connection.id,
      end,
      world
    });
    interactionRef.current = {
      type: "connection-endpoint",
      pointerId: event.pointerId,
      connectionId: connection.id,
      end,
      snapshot: state
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.type === "pan") {
      const dx = event.clientX - interaction.startClient.x;
      const dy = event.clientY - interaction.startClient.y;
      setViewport({
        ...interaction.startViewport,
        x: interaction.startViewport.x + dx,
        y: interaction.startViewport.y + dy
      });
      return;
    }

    const world = screenToWorld(event.clientX, event.clientY);
    if (interaction.type === "drag") {
      const dx = world.x - interaction.lastWorld.x;
      const dy = world.y - interaction.lastWorld.y;
      if (dx !== 0 || dy !== 0) {
        applyEphemeral({ type: "move-elements", ids: interaction.ids, dx, dy });
        interactionRef.current = { ...interaction, lastWorld: world };
      }
      return;
    }

    if (interaction.type === "connection-endpoint") {
      const connection = state.elements[interaction.connectionId];
      const otherEndpoint =
        connection?.kind === "connection"
          ? connectionEndpoint(connection, interaction.end === "from" ? "to" : "from")
          : null;
      const hover = nearestAttachmentPoint(world, nodes)?.endpoint;
      setConnectionDrag({
        connectionId: interaction.connectionId,
        end: interaction.end,
        world,
        hoverEndpoint:
          hover && (!otherEndpoint || !sameEndpoint(hover, otherEndpoint))
            ? hover
            : undefined
      });
      return;
    }

    if (interaction.type === "connection-create") {
      const hover = nearestAttachmentPoint(world, nodes)?.endpoint;
      const didDrag =
        (connectionCreateDrag?.didDrag ?? false) ||
        distance(world, interaction.startWorld) > 4;
      setConnectionCreateDrag({
        source: interaction.source,
        world,
        didDrag,
        hoverEndpoint:
          hover && !sameEndpoint(interaction.source, hover) ? hover : undefined
      });
      if (didDrag) {
        setConnectorSource(null);
      }
      return;
    }

    const width =
      interaction.startSize.width + (world.x - interaction.startWorld.x);
    const height =
      interaction.startSize.height + (world.y - interaction.startWorld.y);
    applyEphemeral({
      type: "resize-node",
      id: interaction.id,
      width,
      height
    });
  };

  const endPointerInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.type === "drag" || interaction.type === "resize") {
      commitSnapshot(interaction.snapshot);
    }
    if (interaction.type === "connection-endpoint") {
      if (connectionDrag?.hoverEndpoint) {
        const connection = state.elements[interaction.connectionId];
        if (connection?.kind === "connection") {
          apply({
            type: "update-element",
            id: connection.id,
            patch: connectionEndpointPatch(
              state,
              connection,
              interaction.end,
              connectionDrag.hoverEndpoint
            )
          });
        }
      }
      setConnectionDrag(null);
    }
    if (interaction.type === "connection-create") {
      const didDrag = connectionCreateDrag?.didDrag ?? false;
      const finalWorld = screenToWorld(event.clientX, event.clientY);
      const finalHoverEndpoint = nearestAttachmentPoint(finalWorld, nodes)?.endpoint;
      const hoverEndpoint =
        finalHoverEndpoint && !sameEndpoint(interaction.source, finalHoverEndpoint)
          ? finalHoverEndpoint
          : connectionCreateDrag?.hoverEndpoint;
      setConnectionCreateDrag(null);

      if (didDrag) {
        setConnectorSource(null);
        if (hoverEndpoint) {
          const created = addConnectionBetweenEndpoints(
            interaction.source,
            hoverEndpoint
          );
          if (created) {
            setTool("select");
          }
        }
      } else {
        handleConnectorEndpointClick(interaction.source);
      }
    }
    if (interaction.type === "pan") {
      setIsPanning(false);
    }
    interactionRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = viewport.zoom * Math.exp(-event.deltaY * 0.002);
      zoomAt(event.clientX, event.clientY, nextZoom);
      return;
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (isTextInput) return;

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

      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedIds.length > 0 && !readonly) {
          event.preventDefault();
          apply({ type: "delete-elements", ids: state.selectedIds });
        }
        return;
      }

      if (event.key === "Enter" && state.selectedIds[0]) {
        event.preventDefault();
        startEditing(state.selectedIds[0]);
      }

      if (event.key === "Escape") {
        setEditing(null);
        setCardinalityMenu(null);
        setConnectorSource(null);
        setConnectionCreateDrag(null);
        apply({ type: "clear-selection" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apply, readonly, redo, startEditing, state.selectedIds, undo]);

  const gridStyle: CSSProperties = {
    backgroundImage:
      "radial-gradient(circle, hsl(var(--canvas-grid) / 0.42) 1px, transparent 1.2px)",
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
    backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`
  };

  return (
    <section
      className={cn(
        "relative h-full min-h-[560px] select-none overflow-hidden bg-canvas-paper text-canvas-ink",
        className
      )}
      onDoubleClickCapture={handleCanvasDoubleClickCapture}
    >
      <TooltipProvider delayDuration={250}>
        <Card className="absolute left-4 top-4 z-20 flex items-center gap-2 bg-card/95 p-1 backdrop-blur">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(nextTool) => {
              setTool((nextTool || "select") as CanvasTool);
              setConnectorSource(null);
              setConnectionCreateDrag(null);
            }}
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
                        disabled={readonly}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Undo"
                disabled={!canUndo || readonly}
                variant="ghost"
                size="icon"
                onClick={undo}
              >
                <Undo2 size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Redo"
                disabled={!canRedo || readonly}
                variant="ghost"
                size="icon"
                onClick={redo}
              >
                <Redo2 size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
        </Card>

        <Card className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-card/95 p-1 backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Zoom out"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  zoomAt(
                    window.innerWidth / 2,
                    window.innerHeight / 2,
                    viewport.zoom / 1.18
                  )
                }
              >
                <ZoomOut size={17} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <div className="min-w-14 px-2 text-center text-sm font-medium tabular-nums text-muted-foreground">
            {Math.round(viewport.zoom * 100)}%
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Zoom in"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  zoomAt(
                    window.innerWidth / 2,
                    window.innerHeight / 2,
                    viewport.zoom * 1.18
                  )
                }
              >
                <ZoomIn size={17} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Reset view"
                variant="ghost"
                size="icon-sm"
                onClick={() => setViewport({ x: 150, y: 110, zoom: 1 })}
              >
                <Crosshair size={17} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>
        </Card>

        {tool === "connector" && (
          <Card className="absolute left-4 top-[72px] z-20 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 bg-card/95 p-1 backdrop-blur">
            <ToggleGroup
              type="single"
              value={connectionCardinality}
              onValueChange={(nextCardinality) => {
                if (nextCardinality) {
                  setConnectionCardinality(
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
                        disabled={readonly}
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
            {connectorSource && (
              <>
                <Separator orientation="vertical" className="h-6" />
                <div className="max-w-44 truncate px-2 text-xs font-medium text-primary">
                  {endpointDisplayName(state, connectorSource)} {"->"}
                </div>
              </>
            )}
          </Card>
        )}
      </TooltipProvider>

      <div
        ref={surfaceRef}
        className={cn(
          "absolute inset-0 select-none",
          isPanning
            ? "cursor-grabbing"
            : tool === "select"
              ? "cursor-grab"
              : "cursor-crosshair"
        )}
        style={gridStyle}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          className="h-full w-full touch-none"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerInteraction}
          onPointerCancel={endPointerInteraction}
        >
          <defs>
            <marker
              id="canvas-arrow"
              markerHeight="10"
              markerWidth="10"
              orient="auto"
              refX="9"
              refY="3"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={CANVAS_PRIMARY} />
            </marker>
          </defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
            {connections.map((connection) =>
              renderConnection({
                connection,
                state,
                dragState: connectionDrag,
                selected: selectedIdSet.has(connection.id),
                onPointerDown: handleElementPointerDown,
                onDoubleClick: handleConnectionDoubleClick,
                onEndpointPointerDown: handleConnectionEndpointPointerDown
              })
            )}
            {connectionCreateDrag?.didDrag &&
              renderConnectionCreatePreview({
                state,
                dragState: connectionCreateDrag,
                cardinality: connectionCardinality
              })}
            {nodes.map((node) =>
              renderNode({
                node,
                selected: selectedIdSet.has(node.id),
                connectorSource,
                tool,
                showAttachmentPoints:
                  tool === "connector" ||
                  Boolean(connectionDrag) ||
                  Boolean(connectionCreateDrag),
                highlightedEndpoint:
                  connectionDrag?.hoverEndpoint ??
                  connectionCreateDrag?.hoverEndpoint,
                readonly,
                onPointerDown: handleElementPointerDown,
                onTextDoubleClick: (id, event) =>
                  startEditing(
                    id,
                    event
                      ? clientToSurfacePoint(event.clientX, event.clientY)
                      : undefined
                  ),
                onEndpointClick: handleConnectorEndpointClick,
                onEndpointPointerDown:
                  tool === "connector"
                    ? handleConnectorEndpointPointerDown
                    : undefined,
                onResizePointerDown: handleResizePointerDown
              })
            )}
          </g>
        </svg>
      </div>

      {editing &&
        renderEditorOverlay({
          editing,
          element: state.elements[editing.id],
          worldToScreen,
          viewport,
          surfaceSize: {
            width: surfaceRef.current?.clientWidth ?? 0,
            height: surfaceRef.current?.clientHeight ?? 0
          },
          setEditing,
          commitEditing
        })}

      {cardinalityMenu &&
        renderCardinalityMenu({
          menu: cardinalityMenu,
          connection: state.elements[cardinalityMenu.connectionId],
          onSelect: (cardinality) => {
            apply({
              type: "update-element",
              id: cardinalityMenu.connectionId,
              patch: { cardinality }
            });
            setCardinalityMenu(null);
          },
          onClose: () => setCardinalityMenu(null)
        })}
    </section>
  );
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

function renderNode({
  node,
  selected,
  connectorSource,
  tool,
  showAttachmentPoints,
  highlightedEndpoint,
  readonly,
  onPointerDown,
  onTextDoubleClick,
  onEndpointClick,
  onEndpointPointerDown,
  onResizePointerDown
}: {
  node: CanvasNode;
  selected: boolean;
  connectorSource: ConnectionEndpoint | null;
  tool: CanvasTool;
  showAttachmentPoints: boolean;
  highlightedEndpoint?: ConnectionEndpoint;
  readonly: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    element: CanvasElement
  ) => void;
  onTextDoubleClick: (id: string, event?: CanvasEditEvent) => void;
  onEndpointClick: (endpoint: ConnectionEndpoint) => void;
  onEndpointPointerDown?: EndpointPointerDownHandler;
  onResizePointerDown: (
    event: ReactPointerEvent<SVGRectElement>,
    node: CanvasNode
  ) => void;
}) {
  const isConnectorSource = connectorSource?.nodeId === node.id;
  const stroke = isConnectorSource ? CANVAS_ACCENT : nodeStroke[node.kind];
  const strokeWidth = selected || isConnectorSource ? 2.5 : 1.4;

  return (
    <g
      key={node.id}
      data-canvas-object="node"
      data-canvas-id={node.id}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(event) => onPointerDown(event, node)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onTextDoubleClick(node.id, event);
      }}
      className="cursor-move"
    >
      {selected && node.kind !== "text" && (
        <rect
          x={-5}
          y={-5}
          width={node.width + 10}
          height={node.height + 10}
          rx={10}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
        />
      )}

      {node.kind === "database" ? (
        <DatabaseShape
          node={node}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onTextDoubleClick={(event) => onTextDoubleClick(node.id, event)}
          onEndpointPointerDown={
            tool === "connector" && onEndpointPointerDown
              ? (event) => onEndpointPointerDown(event, { nodeId: node.id })
              : undefined
          }
        />
      ) : node.kind === "table" ? (
        <TableShape
          node={node}
          stroke={stroke}
          strokeWidth={strokeWidth}
          connectorSource={connectorSource}
          isConnectorMode={tool === "connector"}
          onTextDoubleClick={(event) => onTextDoubleClick(node.id, event)}
          onEndpointClick={onEndpointClick}
          onEndpointPointerDown={onEndpointPointerDown}
        />
      ) : node.kind === "text" ? (
        <TextShape
          node={node}
          selected={selected}
          onTextDoubleClick={(event) => onTextDoubleClick(node.id, event)}
        />
      ) : (
        <rect
          width={node.width}
          height={node.height}
          rx={8}
          fill={nodeFill[node.kind]}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}

      {node.kind !== "table" && node.kind !== "text" && node.kind !== "database" && (
        <WrappedSvgText
          x={12}
          y={10}
          width={node.width - 24}
          height={node.height - 20}
          value={node.label}
          align="center"
          className="text-[15px] font-semibold text-canvas-node-service-foreground"
          onClick={
            tool === "connector"
              ? () => onEndpointClick({ nodeId: node.id })
              : undefined
          }
          onDoubleClick={(event) => onTextDoubleClick(node.id, event)}
          onPointerDown={
            tool === "connector" && onEndpointPointerDown
              ? (event) => onEndpointPointerDown(event, { nodeId: node.id })
              : undefined
          }
        />
      )}

      {selected && node.kind !== "text" && (
        <rect
          x={-5}
          y={-5}
          width={node.width + 10}
          height={node.height + 10}
          rx={10}
          fill="none"
          stroke={CANVAS_PRIMARY}
          strokeDasharray="6 4"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}

      {selected && !readonly && (
        <rect
          x={node.width - 6}
          y={node.height - 6}
          width={12}
          height={12}
          rx={3}
          fill={CANVAS_PRIMARY}
          stroke={CANVAS_CARD}
          strokeWidth={2}
          className="cursor-nwse-resize"
          onPointerDown={(event) => onResizePointerDown(event, node)}
        />
      )}

      {showAttachmentPoints && (
        <AttachmentPoints
          node={node}
          connectorSource={connectorSource}
          highlightedEndpoint={highlightedEndpoint}
          onEndpointClick={onEndpointClick}
          onEndpointPointerDown={onEndpointPointerDown}
        />
      )}
    </g>
  );
}

function AttachmentPoints({
  node,
  connectorSource,
  highlightedEndpoint,
  onEndpointClick,
  onEndpointPointerDown
}: {
  node: CanvasNode;
  connectorSource: ConnectionEndpoint | null;
  highlightedEndpoint?: ConnectionEndpoint;
  onEndpointClick: (endpoint: ConnectionEndpoint) => void;
  onEndpointPointerDown?: EndpointPointerDownHandler;
}) {
  const points = localAttachmentPointsForNode(node);

  return (
    <g data-canvas-object="attachment-points">
      {points.map((attachment) => {
        const isActive =
          sameEndpoint(connectorSource, attachment.endpoint) ||
          sameEndpoint(highlightedEndpoint ?? null, attachment.endpoint);
        return (
          <circle
            key={attachment.id}
            cx={attachment.point.x}
            cy={attachment.point.y}
            r={isActive ? ATTACHMENT_POINT_RADIUS + 1.5 : ATTACHMENT_POINT_RADIUS}
            fill={isActive ? CANVAS_PRIMARY : CANVAS_CARD}
            stroke={isActive ? CANVAS_PRIMARY : CANVAS_ACCENT}
            strokeWidth={1.8}
            className="cursor-crosshair"
            onPointerDown={(event) => {
              if (onEndpointPointerDown) {
                onEndpointPointerDown(event, attachment.endpoint);
                return;
              }
              event.stopPropagation();
              event.preventDefault();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (onEndpointPointerDown) return;
              onEndpointClick(attachment.endpoint);
            }}
          />
        );
      })}
    </g>
  );
}

function DatabaseShape({
  node,
  stroke,
  strokeWidth,
  onTextDoubleClick,
  onEndpointPointerDown
}: {
  node: CanvasNode;
  stroke: string;
  strokeWidth: number;
  onTextDoubleClick: (event: CanvasEditEvent) => void;
  onEndpointPointerDown?: (event: ReactPointerEvent<Element>) => void;
}) {
  const cap = Math.min(24, node.height / 4);
  return (
    <>
      <path
        d={`M 0 ${cap} C 0 ${cap / 2} ${node.width * 0.18} 0 ${node.width / 2} 0 C ${node.width * 0.82} 0 ${node.width} ${cap / 2} ${node.width} ${cap} L ${node.width} ${node.height - cap} C ${node.width} ${node.height - cap / 2} ${node.width * 0.82} ${node.height} ${node.width / 2} ${node.height} C ${node.width * 0.18} ${node.height} 0 ${node.height - cap / 2} 0 ${node.height - cap} Z`}
        fill={nodeFill.database}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <path
        d={`M 0 ${cap} C 0 ${cap * 1.6} ${node.width * 0.18} ${cap * 2} ${node.width / 2} ${cap * 2} C ${node.width * 0.82} ${cap * 2} ${node.width} ${cap * 1.6} ${node.width} ${cap}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <WrappedSvgText
        x={14}
        y={cap + 12}
        width={node.width - 28}
        height={node.height - cap - 22}
        value={node.label}
        align="center"
        className="text-[15px] font-semibold text-canvas-node-database-foreground"
        onDoubleClick={onTextDoubleClick}
        onPointerDown={onEndpointPointerDown}
      />
    </>
  );
}

function TableShape({
  node,
  stroke,
  strokeWidth,
  connectorSource,
  isConnectorMode,
  onTextDoubleClick,
  onEndpointClick,
  onEndpointPointerDown
}: {
  node: CanvasTableNode;
  stroke: string;
  strokeWidth: number;
  connectorSource: ConnectionEndpoint | null;
  isConnectorMode: boolean;
  onTextDoubleClick: (event: CanvasEditEvent) => void;
  onEndpointClick: (endpoint: ConnectionEndpoint) => void;
  onEndpointPointerDown?: EndpointPointerDownHandler;
}) {
  return (
    <>
      <rect
        width={node.width}
        height={node.height}
        rx={8}
        fill={nodeFill.table}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <rect
        width={node.width}
        height={TABLE_HEADER_HEIGHT}
        rx={8}
        fill={themeToken("--canvas-node-table-header")}
      />
      <path
        d={`M 0 ${TABLE_HEADER_HEIGHT} H ${node.width}`}
        stroke={stroke}
        strokeWidth={1.2}
      />
      <WrappedSvgText
        x={12}
        y={7}
        width={node.width - 24}
        height={26}
        value={node.label}
        align="left"
        className="text-[14px] font-bold text-canvas-node-table-foreground"
        onClick={isConnectorMode ? () => onEndpointClick({ nodeId: node.id }) : undefined}
        onDoubleClick={onTextDoubleClick}
        onPointerDown={
          isConnectorMode && onEndpointPointerDown
            ? (event) => onEndpointPointerDown(event, { nodeId: node.id })
            : undefined
        }
      />
      <foreignObject
        x={12}
        y={TABLE_FIELD_TOP}
        width={node.width - 24}
        height={node.height - TABLE_FIELD_TOP - 10}
      >
        <div className="h-full overflow-hidden text-[13px] leading-5 text-canvas-node-service-foreground">
          {node.fields.map((field) => (
            <button
              key={field.id}
              type="button"
              className={`block w-full border-b border-canvas-node-table-foreground/20 bg-transparent py-0.5 text-left text-inherit transition ${
                isConnectorMode ? "cursor-crosshair hover:text-primary" : "cursor-move hover:text-foreground"
              }`}
              style={{ height: TABLE_FIELD_HEIGHT }}
              onPointerDown={(event) => {
                if (event.detail >= 2) {
                  event.stopPropagation();
                  event.preventDefault();
                  onTextDoubleClick(event);
                  return;
                }
                if (isConnectorMode && onEndpointPointerDown) {
                  onEndpointPointerDown(event, {
                    nodeId: node.id,
                    fieldId: field.id,
                    fieldSide: "right"
                  });
                  return;
                }
              }}
              onClick={(event) => {
                if (!isConnectorMode) return;
                event.stopPropagation();
                if (onEndpointPointerDown) return;
                if (isConnectorMode) {
                  onEndpointClick({
                    nodeId: node.id,
                    fieldId: field.id,
                    fieldSide: "right"
                  });
                }
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onTextDoubleClick(event);
              }}
              title={field.text}
            >
              <span className="block truncate">{field.text}</span>
            </button>
          ))}
        </div>
      </foreignObject>
    </>
  );
}

function TextShape({
  node,
  selected,
  onTextDoubleClick
}: {
  node: Extract<CanvasNode, { kind: "text" }>;
  selected: boolean;
  onTextDoubleClick: (event: CanvasEditEvent) => void;
}) {
  return (
    <>
      <rect
        width={node.width}
        height={node.height}
        rx={6}
        fill="transparent"
        stroke={selected ? CANVAS_PRIMARY : "transparent"}
        strokeWidth={1.5}
      />
      <WrappedSvgText
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        value={node.label}
        align="left"
        className="text-[16px] font-medium text-canvas-node-text"
        onDoubleClick={onTextDoubleClick}
      />
    </>
  );
}

function WrappedSvgText({
  x,
  y,
  width,
  height,
  value,
  align,
  className,
  onClick,
  onDoubleClick,
  onPointerDown
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  align: "left" | "center";
  className: string;
  onClick?: () => void;
  onDoubleClick?: (event: CanvasEditEvent) => void;
  onPointerDown?: (event: ReactPointerEvent<Element>) => void;
}) {
  const contentClassName = `flex h-full w-full whitespace-pre-wrap break-words ${className}`;
  const contentStyle: CSSProperties = {
    alignItems: align === "center" ? "center" : "flex-start",
    justifyContent: align === "center" ? "center" : "flex-start",
    overflowWrap: "anywhere",
    textAlign: align
  };

  return (
    <foreignObject x={x} y={y} width={Math.max(20, width)} height={Math.max(20, height)}>
      {onClick || onDoubleClick || onPointerDown ? (
        <button
          type="button"
          className={`${contentClassName} ${
            onClick || onPointerDown ? "cursor-crosshair" : "cursor-move"
          } appearance-none border-0 bg-transparent p-0 text-inherit`}
          style={contentStyle}
          onPointerDown={(event) => {
            if (event.detail >= 2 && onDoubleClick) {
              event.stopPropagation();
              event.preventDefault();
              onDoubleClick(event);
              return;
            }
            if (onPointerDown) {
              onPointerDown(event);
            }
          }}
          onClick={(event) => {
            if (!onClick) return;
            event.stopPropagation();
            onClick();
          }}
          onDoubleClick={(event) => {
            if (!onDoubleClick) return;
            event.stopPropagation();
            onDoubleClick(event);
          }}
        >
          {value}
        </button>
      ) : (
        <div className={contentClassName} style={contentStyle}>
          {value}
        </div>
      )}
    </foreignObject>
  );
}

function renderConnection({
  connection,
  state,
  dragState,
  selected,
  onPointerDown,
  onDoubleClick,
  onEndpointPointerDown
}: {
  connection: CanvasConnection;
  state: CanvasState;
  dragState: ConnectionDragState | null;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    element: CanvasElement
  ) => void;
  onDoubleClick: (
    event: ReactMouseEvent<SVGGElement>,
    connection: CanvasConnection
  ) => void;
  onEndpointPointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    connection: CanvasConnection,
    end: ConnectionEnd
  ) => void;
}) {
  const from = state.elements[connection.fromId];
  const to = state.elements[connection.toId];
  if (!isNode(from) || !isNode(to)) return null;

  const anchors = connectionAnchors(state, connection, dragState);
  if (!anchors) return null;

  const { startAnchor, endAnchor, fromNode, toNode } = anchors;
  const start = startAnchor.point;
  const end = endAnchor.point;
  const [fromTerminal, toTerminal] = cardinalityTerminals(
    connection.cardinality
  );
  const usesRelationshipMarkers = isTableRelationship(fromNode, toNode);
  const pathStartAnchor = usesRelationshipMarkers
    ? relationshipLineAnchor(startAnchor, fromTerminal)
    : startAnchor;
  const pathEndAnchor = usesRelationshipMarkers
    ? relationshipLineAnchor(endAnchor, toTerminal)
    : endAnchor;
  const routePoints = routedConnectorPoints(pathStartAnchor, pathEndAnchor);
  const path = roundedOrthogonalPath(routePoints);
  const mid = connectorLabelPoint(routePoints, {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  });
  const showLabel = shouldRenderConnectionLabel(connection, fromNode, toNode);
  const showArrow = !usesRelationshipMarkers;
  const stroke = selected ? CANVAS_CONNECTION_SELECTED : CANVAS_CONNECTION;
  const strokeWidth = selected ? 2.8 : 2;

  return (
    <g
      key={connection.id}
      data-canvas-object="connection"
      data-canvas-id={connection.id}
      onPointerDown={(event) => onPointerDown(event, connection)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(event, connection);
      }}
      className="cursor-pointer"
    >
      <path
        d={path}
        stroke="transparent"
        fill="none"
        strokeWidth={18}
      />
      <path
        d={path}
        stroke={stroke}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={showArrow ? "url(#canvas-arrow)" : undefined}
      />
      {usesRelationshipMarkers && (
        <>
          <RelationshipEndpointMarker
            anchor={startAnchor}
            terminal={fromTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <RelationshipEndpointMarker
            anchor={endAnchor}
            terminal={toTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      )}
      {showLabel && (
        <foreignObject x={mid.x - 78} y={mid.y - 17} width={156} height={34}>
          <div className="flex h-full items-center justify-center">
            <span className="max-w-[150px] truncate rounded border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              {connection.label}
            </span>
          </div>
        </foreignObject>
      )}
      {selected && (
        <>
          <ConnectionEndpointHandle
            point={start}
            onPointerDown={(event) =>
              onEndpointPointerDown(event, connection, "from")
            }
          />
          <ConnectionEndpointHandle
            point={end}
            onPointerDown={(event) =>
              onEndpointPointerDown(event, connection, "to")
            }
          />
        </>
      )}
    </g>
  );
}

function renderConnectionCreatePreview({
  state,
  dragState,
  cardinality
}: {
  state: CanvasState;
  dragState: ConnectionCreateDragState;
  cardinality: CanvasConnectionCardinality;
}) {
  const fromNode = state.elements[dragState.source.nodeId];
  if (!isNode(fromNode)) return null;

  const [fromTerminal, toTerminal] = cardinalityTerminals(cardinality);
  let startAnchor: EndpointAnchor | null = null;
  let endAnchor: EndpointAnchor | null = null;
  let usesRelationshipMarkers = false;

  if (dragState.hoverEndpoint) {
    const toNode = state.elements[dragState.hoverEndpoint.nodeId];
    if (!isNode(toNode)) return null;

    startAnchor = endpointAnchorFromState(
      state,
      dragState.source,
      centerOf(toNode)
    );
    endAnchor = endpointAnchorFromState(
      state,
      dragState.hoverEndpoint,
      startAnchor?.point ?? centerOf(fromNode)
    );
    usesRelationshipMarkers = isTableRelationship(fromNode, toNode);
  } else {
    startAnchor = endpointAnchorFromState(
      state,
      dragState.source,
      dragState.world
    );
    if (startAnchor) {
      endAnchor = freeEndpointAnchor(dragState.world, startAnchor.point);
    }
  }

  if (!startAnchor || !endAnchor) return null;

  const pathStartAnchor = usesRelationshipMarkers
    ? relationshipLineAnchor(startAnchor, fromTerminal)
    : startAnchor;
  const pathEndAnchor = usesRelationshipMarkers
    ? relationshipLineAnchor(endAnchor, toTerminal)
    : endAnchor;
  const path = roundedOrthogonalPath(
    routedConnectorPoints(pathStartAnchor, pathEndAnchor)
  );
  const stroke = CANVAS_PRIMARY;
  const strokeWidth = 2.4;

  return (
    <g data-canvas-object="connection-preview" pointerEvents="none">
      <path
        d={path}
        stroke={stroke}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="6 4"
        markerEnd={usesRelationshipMarkers ? undefined : "url(#canvas-arrow)"}
      />
      {usesRelationshipMarkers && (
        <>
          <RelationshipEndpointMarker
            anchor={startAnchor}
            terminal={fromTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <RelationshipEndpointMarker
            anchor={endAnchor}
            terminal={toTerminal}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      )}
    </g>
  );
}

function ConnectionEndpointHandle({
  point,
  onPointerDown
}: {
  point: Point;
  onPointerDown: (event: ReactPointerEvent<SVGCircleElement>) => void;
}) {
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={6}
      fill={CANVAS_CARD}
      stroke={CANVAS_PRIMARY}
      strokeWidth={2}
      className="cursor-grab"
      onPointerDown={onPointerDown}
    />
  );
}

function RelationshipEndpointMarker({
  anchor,
  terminal,
  stroke,
  strokeWidth
}: {
  anchor: EndpointAnchor;
  terminal: EndpointMultiplicity;
  stroke: string;
  strokeWidth: number;
}) {
  const direction = sideVector(anchor.side);
  const normal = perpendicularVector(direction);
  const pieces = endpointPieces(terminal);

  return (
    <g
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      pointerEvents="none"
    >
      {pieces.map((piece, index) => {
        if (piece === "bar") {
          const center = relationshipTerminalPoint(anchor, "one");
          const start = addPoints(
            center,
            scalePoint(normal, ERD_MARKER_HEIGHT / 2)
          );
          const end = addPoints(
            center,
            scalePoint(normal, -ERD_MARKER_HEIGHT / 2)
          );
          return (
            <line
              key={`${piece}-${index}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          );
        }

        if (piece === "circle") {
          const center = addPoints(
            anchor.point,
            scalePoint(direction, ERD_MARKER_GAP + ERD_CIRCLE_RADIUS)
          );
          return (
            <circle
              key={`${piece}-${index}`}
              cx={center.x}
              cy={center.y}
              r={ERD_CIRCLE_RADIUS}
              fill={CANVAS_CARD}
            />
          );
        }

        const joint = relationshipTerminalPoint(anchor, "many");
        const toe = addPoints(
          anchor.point,
          scalePoint(direction, ERD_MARKER_GAP)
        );
        const spreadStart = addPoints(toe, scalePoint(normal, ERD_CROW_SPREAD));
        const spreadEnd = addPoints(toe, scalePoint(normal, -ERD_CROW_SPREAD));
        return (
          <g key={`${piece}-${index}`}>
            <line x1={joint.x} y1={joint.y} x2={toe.x} y2={toe.y} />
            <line
              x1={joint.x}
              y1={joint.y}
              x2={spreadStart.x}
              y2={spreadStart.y}
            />
            <line
              x1={joint.x}
              y1={joint.y}
              x2={spreadEnd.x}
              y2={spreadEnd.y}
            />
          </g>
        );
      })}
    </g>
  );
}

function cardinalityTerminals(
  cardinality?: CanvasConnectionCardinality
): [EndpointMultiplicity, EndpointMultiplicity] {
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

function relationshipLineAnchor(
  anchor: EndpointAnchor,
  terminal: EndpointMultiplicity
): EndpointAnchor {
  return {
    ...anchor,
    point: relationshipTerminalPoint(anchor, terminal)
  };
}

function relationshipTerminalPoint(
  anchor: EndpointAnchor,
  terminal: EndpointMultiplicity
): Point {
  const direction = sideVector(anchor.side);
  const distanceFromAnchor =
    terminal === "many" ? ERD_MARKER_GAP + ERD_CROW_LENGTH : ERD_MARKER_GAP;
  return addPoints(anchor.point, scalePoint(direction, distanceFromAnchor));
}

function endpointPieces(
  terminal: EndpointMultiplicity
): Array<"bar" | "circle" | "crow"> {
  switch (terminal) {
    case "many":
      return ["crow"];
    case "one":
    default:
      return ["bar"];
  }
}

function renderCardinalityMenu({
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
      className="fixed z-40 w-[232px] bg-card/95 p-2 backdrop-blur"
      style={{
        left: menu.x,
        top: menu.y
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
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

function renderEditorOverlay({
  editing,
  element,
  worldToScreen,
  viewport,
  surfaceSize,
  setEditing,
  commitEditing
}: {
  editing: EditingState;
  element: CanvasElement | undefined;
  worldToScreen: (point: Point) => Point;
  viewport: Viewport;
  surfaceSize: { width: number; height: number };
  setEditing: (editing: EditingState | null) => void;
  commitEditing: () => void;
}) {
  if (!element) return null;
  let topLeft: Point;
  let width = 180;
  let height = 72;

  if (element.kind === "connection") {
    topLeft = worldToScreen({ x: 80, y: 80 });
  } else {
    topLeft = worldToScreen({ x: element.x, y: element.y });
    width = element.width * viewport.zoom;
    height = element.height * viewport.zoom;
  }

  if (editing.anchor) {
    topLeft = {
      x: editing.anchor.x + 8,
      y: editing.anchor.y + 8
    };
  }

  const editorWidth = Math.max(150, width);
  const editorHeight = Math.max(48, height);
  const clampedTopLeft = clampEditorPosition(
    topLeft,
    editorWidth,
    editorHeight,
    surfaceSize
  );

  return (
    <Textarea
      autoFocus
      value={editing.value}
      onChange={(event) =>
        setEditing({ ...editing, value: event.currentTarget.value })
      }
      onBlur={commitEditing}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commitEditing();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(null);
        }
      }}
      className="absolute z-30 resize-none select-text border-2 border-primary bg-card/95 p-2 shadow-toolbar"
      style={{
        left: clampedTopLeft.x,
        top: clampedTopLeft.y,
        width: editorWidth,
        height: editorHeight,
        overflowWrap: "anywhere"
      }}
    />
  );
}

function clampEditorPosition(
  topLeft: Point,
  width: number,
  height: number,
  surfaceSize: { width: number; height: number }
): Point {
  if (surfaceSize.width <= 0 || surfaceSize.height <= 0) {
    return topLeft;
  }

  const margin = 8;
  const maxX = Math.max(margin, surfaceSize.width - width - margin);
  const maxY = Math.max(margin, surfaceSize.height - height - margin);

  return {
    x: clamp(topLeft.x, margin, maxX),
    y: clamp(topLeft.y, margin, maxY)
  };
}

function isDoublePointerPress(
  id: string,
  event: ReactPointerEvent<Element>,
  lastPointerPressRef: { current: PointerPressState | null }
): boolean {
  const now = Date.now();
  const client = { x: event.clientX, y: event.clientY };
  const last = lastPointerPressRef.current;
  lastPointerPressRef.current = {
    id,
    client,
    timestamp: now
  };

  if (!last || last.id !== id) {
    return false;
  }

  return (
    now - last.timestamp <= DOUBLE_CLICK_MAX_MS &&
    distance(client, last.client) <= DOUBLE_CLICK_MAX_DISTANCE
  );
}

function centerOf(node: CanvasNode): Point {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function connectionEndpoint(
  connection: CanvasConnection,
  end: ConnectionEnd
): ConnectionEndpoint {
  if (end === "from") {
    return {
      nodeId: connection.fromId,
      fieldId: connection.fromFieldId,
      anchor: connection.fromAnchor,
      fieldSide: connection.fromFieldSide
    };
  }

  return {
    nodeId: connection.toId,
    fieldId: connection.toFieldId,
    anchor: connection.toAnchor,
    fieldSide: connection.toFieldSide
  };
}

function connectionEndpointPatch(
  state: CanvasState,
  connection: CanvasConnection,
  end: ConnectionEnd,
  endpoint: ConnectionEndpoint
): Partial<CanvasConnection> {
  const fromEndpoint =
    end === "from" ? endpoint : connectionEndpoint(connection, "from");
  const toEndpoint =
    end === "to" ? endpoint : connectionEndpoint(connection, "to");
  const from = state.elements[fromEndpoint.nodeId];
  const to = state.elements[toEndpoint.nodeId];
  const isTableConnection =
    isNode(from) && isNode(to) && isTableRelationship(from, to);
  const endpointPatch =
    end === "from"
      ? {
          fromId: endpoint.nodeId,
          fromFieldId: endpoint.fieldId,
          fromAnchor: endpoint.anchor,
          fromFieldSide: endpoint.fieldSide
        }
      : {
          toId: endpoint.nodeId,
          toFieldId: endpoint.fieldId,
          toAnchor: endpoint.anchor,
          toFieldSide: endpoint.fieldSide
        };

  return {
    ...endpointPatch,
    label: isTableConnection ? "" : connection.label
  };
}

function connectionAnchors(
  state: CanvasState,
  connection: CanvasConnection,
  dragState: ConnectionDragState | null
): {
  startAnchor: EndpointAnchor;
  endAnchor: EndpointAnchor;
  fromNode: CanvasNode;
  toNode: CanvasNode;
} | null {
  const baseFromEndpoint = connectionEndpoint(connection, "from");
  const baseToEndpoint = connectionEndpoint(connection, "to");
  const draggingThisConnection = dragState?.connectionId === connection.id;
  const fromEndpoint =
    draggingThisConnection && dragState.end === "from" && dragState.hoverEndpoint
      ? dragState.hoverEndpoint
      : baseFromEndpoint;
  const toEndpoint =
    draggingThisConnection && dragState.end === "to" && dragState.hoverEndpoint
      ? dragState.hoverEndpoint
      : baseToEndpoint;
  const fromNode = state.elements[fromEndpoint.nodeId];
  const toNode = state.elements[toEndpoint.nodeId];
  if (!isNode(fromNode) || !isNode(toNode)) return null;

  if (draggingThisConnection && dragState.end === "from" && !dragState.hoverEndpoint) {
    const endAnchor = endpointAnchorFromState(state, toEndpoint, dragState.world);
    if (!endAnchor) return null;
    return {
      startAnchor: freeEndpointAnchor(dragState.world, endAnchor.point),
      endAnchor,
      fromNode,
      toNode
    };
  }

  if (draggingThisConnection && dragState.end === "to" && !dragState.hoverEndpoint) {
    const startAnchor = endpointAnchorFromState(state, fromEndpoint, dragState.world);
    if (!startAnchor) return null;
    return {
      startAnchor,
      endAnchor: freeEndpointAnchor(dragState.world, startAnchor.point),
      fromNode,
      toNode
    };
  }

  const startAnchor = endpointAnchorFromState(state, fromEndpoint, centerOf(toNode));
  const endAnchor = endpointAnchorFromState(
    state,
    toEndpoint,
    startAnchor?.point ?? centerOf(fromNode)
  );
  if (!startAnchor || !endAnchor) return null;

  return { startAnchor, endAnchor, fromNode, toNode };
}

function endpointAnchorFromState(
  state: CanvasState,
  endpoint: ConnectionEndpoint,
  toward: Point
): EndpointAnchor | null {
  const element = state.elements[endpoint.nodeId];
  if (!isNode(element)) return null;

  if (element.kind === "table" && endpoint.fieldId) {
    const side = endpoint.fieldSide ?? (toward.x < centerOf(element).x ? "left" : "right");
    const point = tableFieldSidePoint(element, endpoint.fieldId, side);
    if (point) return { point, side };
  }

  const anchor = endpoint.anchor ?? nearestNodeAnchor(element, toward);
  const point = nodeAnchorPoint(element, anchor);
  return {
    point,
    side: anchorSide(anchor, point, toward)
  };
}

function freeEndpointAnchor(point: Point, toward: Point): EndpointAnchor {
  return {
    point,
    side: dominantSide(point, toward)
  };
}

function localAttachmentPointsForNode(node: CanvasNode): AttachmentPoint[] {
  const points: AttachmentPoint[] = anchorsForNode(node).map((anchor) => ({
    id: `node-${anchor}`,
    point: nodeAnchorPointLocal(node, anchor),
    endpoint: { nodeId: node.id, anchor }
  }));

  if (node.kind === "table") {
    for (const field of node.fields) {
      for (const side of ["left", "right"] satisfies CanvasFieldSide[]) {
        const point = tableFieldSidePointLocal(node, field.id, side);
        if (!point) continue;
        points.push({
          id: `field-${field.id}-${side}`,
          point,
          endpoint: { nodeId: node.id, fieldId: field.id, fieldSide: side }
        });
      }
    }
  }

  return points;
}

function nearestAttachmentPoint(
  point: Point,
  nodes: CanvasNode[]
): AttachmentPoint | null {
  let nearest: AttachmentPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  const considerAttachment = (
    id: string,
    attachmentPoint: Point,
    endpoint: ConnectionEndpoint
  ) => {
    const nextDistance = distance(point, attachmentPoint);
    if (nextDistance < nearestDistance) {
      nearest = { id, point: attachmentPoint, endpoint };
      nearestDistance = nextDistance;
    }
  };

  for (const node of nodes) {
    for (const anchor of anchorsForNode(node)) {
      considerAttachment(`node-${anchor}`, nodeAnchorPoint(node, anchor), {
        nodeId: node.id,
        anchor
      });
    }

    if (node.kind === "table") {
      for (const field of node.fields) {
        for (const side of ["left", "right"] satisfies CanvasFieldSide[]) {
          const fieldPoint = tableFieldSidePoint(node, field.id, side);
          if (!fieldPoint) continue;
          considerAttachment(`field-${field.id}-${side}`, fieldPoint, {
            nodeId: node.id,
            fieldId: field.id,
            fieldSide: side
          });
        }
      }
    }
  }

  return nearest && nearestDistance <= ATTACHMENT_HIT_RADIUS ? nearest : null;
}

function nearestAttachmentPointForNode(
  node: CanvasNode,
  point: Point
): AttachmentPoint | null {
  return nearestAttachmentPoint(point, [node]);
}

function nearestNodeAnchor(node: CanvasNode, toward: Point): CanvasNodeAnchor {
  const anchors = anchorsForNode(node);
  let nearest = anchors[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
    const point = nodeAnchorPoint(node, anchor);
    const nextDistance = distance(point, toward);
    if (nextDistance < nearestDistance) {
      nearest = anchor;
      nearestDistance = nextDistance;
    }
  }

  return nearest;
}

function anchorsForNode(node: CanvasNode): CanvasNodeAnchor[] {
  return node.kind === "table" ? tableNodeAnchors : nodeAnchors;
}

function nodeAnchorPoint(node: CanvasNode, anchor: CanvasNodeAnchor): Point {
  const local = nodeAnchorPointLocal(node, anchor);
  return {
    x: node.x + local.x,
    y: node.y + local.y
  };
}

function nodeAnchorPointLocal(
  node: CanvasNode,
  anchor: CanvasNodeAnchor
): Point {
  const midX = node.width / 2;
  const midY = node.height / 2;

  switch (anchor) {
    case "top-left":
      return { x: 0, y: 0 };
    case "top":
      return { x: midX, y: 0 };
    case "top-right":
      return { x: node.width, y: 0 };
    case "right":
      return { x: node.width, y: midY };
    case "bottom-right":
      return { x: node.width, y: node.height };
    case "bottom":
      return { x: midX, y: node.height };
    case "bottom-left":
      return { x: 0, y: node.height };
    case "left":
      return { x: 0, y: midY };
    default:
      return { x: node.width, y: midY };
  }
}

function anchorSide(
  anchor: CanvasNodeAnchor,
  point: Point,
  toward: Point
): AnchorSide {
  switch (anchor) {
    case "top":
    case "right":
    case "bottom":
    case "left":
      return anchor;
    case "top-left":
      return cornerSide(point, toward, "top", "left");
    case "top-right":
      return cornerSide(point, toward, "top", "right");
    case "bottom-right":
      return cornerSide(point, toward, "bottom", "right");
    case "bottom-left":
      return cornerSide(point, toward, "bottom", "left");
    default:
      return dominantSide(point, toward);
  }
}

function tableFieldSidePoint(
  table: CanvasTableNode,
  fieldId: string,
  side: CanvasFieldSide
): Point | null {
  const local = tableFieldSidePointLocal(table, fieldId, side);
  if (!local) return null;
  return {
    x: table.x + local.x,
    y: table.y + local.y
  };
}

function tableFieldSidePointLocal(
  table: CanvasTableNode,
  fieldId: string,
  side: CanvasFieldSide
): Point | null {
  const fieldIndex = table.fields.findIndex((field) => field.id === fieldId);
  if (fieldIndex < 0) return null;

  return {
    x: side === "left" ? 0 : table.width,
    y: TABLE_FIELD_TOP + fieldIndex * TABLE_FIELD_HEIGHT + TABLE_FIELD_HEIGHT / 2
  };
}

function endpointDisplayName(
  state: CanvasState,
  endpoint: ConnectionEndpoint
): string {
  const element = state.elements[endpoint.nodeId];
  if (!isNode(element)) return "Source";

  if (element.kind === "table" && endpoint.fieldId) {
    const field = element.fields.find((item) => item.id === endpoint.fieldId);
    if (field) return `${element.label}.${fieldName(field)}`;
  }

  return element.label || element.id;
}

function fieldName(field: CanvasField): string {
  return field.text.trim().split(/[\s:=|]+/)[0] || field.text || field.id;
}

function sameEndpoint(
  first: ConnectionEndpoint | null,
  second: ConnectionEndpoint
): boolean {
  return (
    first?.nodeId === second.nodeId &&
    (first.fieldId ?? "") === (second.fieldId ?? "") &&
    (first.anchor ?? "") === (second.anchor ?? "") &&
    (first.fieldSide ?? "") === (second.fieldSide ?? "")
  );
}

function hasDatabaseEndpoint(
  from: CanvasNode,
  to: CanvasNode,
  connection: CanvasConnection
): boolean {
  return (
    from.kind === "database" ||
    from.kind === "table" ||
    to.kind === "database" ||
    to.kind === "table" ||
    Boolean(connection.fromFieldId || connection.toFieldId)
  );
}

function connectionLabelForEndpoints(
  from: CanvasNode,
  to: CanvasNode,
  fromEndpoint: ConnectionEndpoint,
  toEndpoint: ConnectionEndpoint
): string {
  if (isTableRelationship(from, to)) return "";
  return fromEndpoint.fieldId || toEndpoint.fieldId ? "maps" : "relates";
}

function isTableRelationship(from: CanvasNode, to: CanvasNode): boolean {
  return from.kind === "table" && to.kind === "table";
}

function shouldRenderConnectionLabel(
  connection: CanvasConnection,
  from: CanvasNode,
  to: CanvasNode
): boolean {
  if (isTableRelationship(from, to)) return false;
  return Boolean(connection.label);
}

function routedConnectorPoints(start: EndpointAnchor, end: EndpointAnchor): Point[] {
  const directPoints = directConnectorPoints(start, end);
  if (directPoints) return directPoints;

  const startLead = connectorLeadPoint(start);
  const endLead = connectorLeadPoint(end);
  const startAxis = sideAxis(start.side);
  const endAxis = sideAxis(end.side);

  if (startAxis === "horizontal" && endAxis === "horizontal") {
    const midX = (startLead.x + endLead.x) / 2;
    return [
      start.point,
      startLead,
      { x: midX, y: startLead.y },
      { x: midX, y: endLead.y },
      endLead,
      end.point
    ];
  }

  if (startAxis === "vertical" && endAxis === "vertical") {
    const midY = (startLead.y + endLead.y) / 2;
    return [
      start.point,
      startLead,
      { x: startLead.x, y: midY },
      { x: endLead.x, y: midY },
      endLead,
      end.point
    ];
  }

  if (startAxis === "horizontal") {
    return [
      start.point,
      startLead,
      { x: endLead.x, y: startLead.y },
      endLead,
      end.point
    ];
  }

  return [
    start.point,
    startLead,
    { x: startLead.x, y: endLead.y },
    endLead,
    end.point
  ];
}

function directConnectorPoints(
  start: EndpointAnchor,
  end: EndpointAnchor
): Point[] | null {
  if (
    Math.abs(start.point.y - end.point.y) <= 0.5 &&
    ((start.side === "right" &&
      end.side === "left" &&
      end.point.x >= start.point.x) ||
      (start.side === "left" &&
        end.side === "right" &&
        end.point.x <= start.point.x))
  ) {
    return [start.point, end.point];
  }

  if (
    Math.abs(start.point.x - end.point.x) <= 0.5 &&
    ((start.side === "bottom" &&
      end.side === "top" &&
      end.point.y >= start.point.y) ||
      (start.side === "top" &&
        end.side === "bottom" &&
        end.point.y <= start.point.y))
  ) {
    return [start.point, end.point];
  }

  return null;
}

function connectorLabelPoint(points: Point[], fallback: Point): Point {
  const compacted = compactPoints(points);
  let nearest = fallback;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < compacted.length; index += 1) {
    const previous = compacted[index - 1];
    const current = compacted[index];
    const candidate = closestPointOnSegment(fallback, previous, current);
    const candidateDistance = distance(fallback, candidate);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

function roundedOrthogonalPath(points: Point[]): string {
  const compacted = compactPoints(points);
  if (compacted.length === 0) return "";
  if (compacted.length === 1) {
    return `M ${compacted[0].x} ${compacted[0].y}`;
  }

  const commands = [`M ${compacted[0].x} ${compacted[0].y}`];
  for (let index = 1; index < compacted.length - 1; index += 1) {
    const previous = compacted[index - 1];
    const current = compacted[index];
    const next = compacted[index + 1];
    const radius = Math.min(
      CONNECTOR_CORNER_RADIUS,
      distance(previous, current) / 2,
      distance(current, next) / 2
    );

    if (radius <= 0.5) {
      commands.push(`L ${current.x} ${current.y}`);
      continue;
    }

    const before = moveToward(current, previous, radius);
    const after = moveToward(current, next, radius);
    commands.push(`L ${before.x} ${before.y}`);
    commands.push(`Q ${current.x} ${current.y} ${after.x} ${after.y}`);
  }

  const last = compacted[compacted.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

function compactPoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || distance(previous, point) > 0.5;
  });
}

function connectorLeadPoint(anchor: EndpointAnchor): Point {
  const direction = sideVector(anchor.side);
  return addPoints(anchor.point, scalePoint(direction, CONNECTOR_LEAD));
}

function sideAxis(side: AnchorSide): "horizontal" | "vertical" {
  return side === "left" || side === "right" ? "horizontal" : "vertical";
}

function sideVector(side: AnchorSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
    default:
      return { x: -1, y: 0 };
  }
}

function perpendicularVector(point: Point): Point {
  return { x: -point.y, y: point.x };
}

function addPoints(first: Point, second: Point): Point {
  return {
    x: first.x + second.x,
    y: first.y + second.y
  };
}

function scalePoint(point: Point, scale: number): Point {
  return {
    x: point.x * scale,
    y: point.y * scale
  };
}

function dominantSide(point: Point, toward: Point): AnchorSide {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }

  return dy < 0 ? "top" : "bottom";
}

function cornerSide(
  point: Point,
  toward: Point,
  verticalSide: Extract<AnchorSide, "top" | "bottom">,
  horizontalSide: Extract<AnchorSide, "left" | "right">
): AnchorSide {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const isTowardVerticalSide =
    verticalSide === "top" ? dy < 0 : dy > 0;
  const isTowardHorizontalSide =
    horizontalSide === "left" ? dx < 0 : dx > 0;

  if (isTowardVerticalSide && isTowardHorizontalSide) {
    return Math.abs(dy) > Math.abs(dx) ? verticalSide : horizontalSide;
  }

  if (isTowardVerticalSide) return verticalSide;
  if (isTowardHorizontalSide) return horizontalSide;
  return dominantSide(point, toward);
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return start;

  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const clamped = clamp(projection, 0, 1);

  return {
    x: start.x + dx * clamped,
    y: start.y + dy * clamped
  };
}

function moveToward(from: Point, to: Point, amount: number): Point {
  const total = distance(from, to);
  if (total === 0) return from;

  return {
    x: from.x + ((to.x - from.x) / total) * amount,
    y: from.y + ((to.y - from.y) / total) * amount
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
