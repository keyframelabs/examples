import {
  createConnection,
  createEmptyCanvasState,
  createField,
  createNode
} from "@/components/canvas/model/state";
import type {
  CanvasConnection,
  CanvasElement,
  CanvasNodeAnchor,
  CanvasState
} from "@/components/canvas/model/types";
import { serializeCanvasToText } from "@/components/canvas/serializer/serializeCanvas";

export const TINYURL_PACKET_ID = "tinyurl-system-design";

export interface CanvasSessionDefaults {
  initialState: CanvasState;
  canvasText: string;
}

export function createCanvasSessionDefaults(
  packetId?: string
): CanvasSessionDefaults {
  const initialState =
    packetId === TINYURL_PACKET_ID
      ? createTinyUrlCanvasState()
      : createEmptyCanvasState();

  return {
    initialState,
    canvasText: serializeCanvasToText(initialState).text
  };
}

export function createTinyUrlCanvasState(): CanvasState {
  const user = createNode("actor", -107, 18, {
    id: "tinyurl_client",
    label: "User",
    alias: "user",
    width: 160,
    height: 104
  });
  const loadBalancer = createNode("service", 353, 8, {
    id: "tinyurl_load_balancer",
    label: "Load Balancer",
    alias: "load_balancer",
    width: 222,
    height: 134
  });
  const urlService = createNode("service", 928, 8, {
    id: "tinyurl_api_redirect",
    label: "URL Service",
    alias: "url_service",
    width: 220,
    height: 132
  });
  const cache = createNode("database", 1453, -7, {
    id: "tinyurl_cache",
    label: "Cache",
    alias: "cache",
    width: 230,
    height: 159
  });
  const primaryDatabase = createNode("database", 1453, 238, {
    id: "tinyurl_sql_primary",
    label: "SQL Primary",
    alias: "sql_primary",
    width: 240,
    height: 158
  });
  const urlMappings = createNode("table", 863, 558, {
    id: "tinyurl_url_mappings",
    label: "URL Map",
    alias: "url_map",
    width: 352,
    height: 260,
    tableType: "SQL",
    databaseId: primaryDatabase.id,
    fields: [
      createField({
        id: "tinyurl_field_short_code",
        text: "short_code",
        primaryKey: true
      }),
      createField({ id: "tinyurl_field_long_url", text: "long_url" }),
      createField({ id: "tinyurl_field_created_at", text: "created_at" }),
      createField({ id: "tinyurl_field_expires_at", text: "expires_at" })
    ]
  });
  const nodes = [
    user,
    loadBalancer,
    urlService,
    cache,
    primaryDatabase,
    urlMappings
  ];
  const connections = [
    templateConnection(
      "tinyurl_conn_client_lb",
      user.id,
      loadBalancer.id,
      "Request",
      "right",
      "left"
    ),
    templateConnection(
      "tinyurl_conn_lb_client_response",
      loadBalancer.id,
      user.id,
      "Long URL Redirect",
      "top-left",
      "top-right",
      48
    ),
    templateConnection(
      "tinyurl_conn_lb_api",
      loadBalancer.id,
      urlService.id,
      "Route",
      "right",
      "left"
    ),
    templateConnection(
      "tinyurl_conn_api_lb_redirect",
      urlService.id,
      loadBalancer.id,
      "301 Redirect",
      "bottom-left",
      "bottom-right",
      48
    ),
    templateConnection(
      "tinyurl_conn_api_cache_lookup",
      urlService.id,
      cache.id,
      "Lookup",
      "right",
      "left"
    ),
    templateConnection(
      "tinyurl_conn_cache_api_hit",
      cache.id,
      urlService.id,
      "Cache Hit",
      "top",
      "top-right",
      48
    ),
    templateConnection(
      "tinyurl_conn_api_primary_miss",
      urlService.id,
      primaryDatabase.id,
      "Cache Miss",
      "bottom-right",
      "left"
    ),
    templateConnection(
      "tinyurl_conn_api_table_write",
      urlService.id,
      urlMappings.id,
      "Write",
      "bottom",
      "top"
    )
  ];
  const elements = [...nodes, ...connections];

  return {
    ...createEmptyCanvasState(),
    elements: Object.fromEntries(
      elements.map((element) => [element.id, element])
    ) as Record<string, CanvasElement>,
    order: elements.map((element) => element.id)
  };
}

function templateConnection(
  id: string,
  fromId: string,
  toId: string,
  label: string,
  fromAnchor: CanvasNodeAnchor,
  toAnchor: CanvasNodeAnchor,
  routingOffset?: number
): CanvasConnection {
  return {
    ...createConnection(fromId, toId, label, { fromAnchor, toAnchor }),
    id,
    cardinality: undefined,
    labelSize: "large",
    ...(routingOffset === undefined ? {} : { routingOffset })
  };
}
