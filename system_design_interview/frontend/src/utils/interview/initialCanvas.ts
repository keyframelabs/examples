import {
  CANVAS_SCHEMA_VERSION,
  type CanvasState
} from "@/components/canvas/model/types";

export const initialSystemDesignCanvas: CanvasState = {
  version: CANVAS_SCHEMA_VERSION,
  selectedIds: [],
  order: ["candidate", "client", "edge", "api", "worker", "cache", "db", "events", "profiles", "c1", "c2", "c3", "c4", "c5", "c6"],
  elements: {
    candidate: {
      id: "candidate",
      kind: "text",
      x: -240,
      y: -120,
      width: 260,
      height: 86,
      label: "Design the system by adding services, storage, data flows, and tradeoff notes.",
      fontSize: 16
    },
    client: {
      id: "client",
      kind: "actor",
      x: -60,
      y: 90,
      width: 160,
      height: 78,
      label: "Users",
      alias: "users"
    },
    edge: {
      id: "edge",
      kind: "service",
      x: 220,
      y: 70,
      width: 190,
      height: 96,
      label: "Edge Gateway",
      alias: "edge"
    },
    api: {
      id: "api",
      kind: "service",
      x: 520,
      y: 70,
      width: 210,
      height: 96,
      label: "Core API",
      alias: "api"
    },
    worker: {
      id: "worker",
      kind: "service",
      x: 520,
      y: 270,
      width: 210,
      height: 96,
      label: "Async Workers",
      alias: "workers"
    },
    cache: {
      id: "cache",
      kind: "database",
      x: 820,
      y: 30,
      width: 180,
      height: 118,
      label: "Redis Cache",
      alias: "redis"
    },
    db: {
      id: "db",
      kind: "database",
      x: 820,
      y: 230,
      width: 180,
      height: 118,
      label: "Postgres",
      alias: "pg"
    },
    events: {
      id: "events",
      kind: "table",
      x: 1080,
      y: 200,
      width: 250,
      height: 154,
      label: "events",
      alias: "events",
      databaseId: "db",
      fields: [
        { id: "field_1", text: "id pk" },
        { id: "field_2", text: "actor_id fk" },
        { id: "field_3", text: "created_at" }
      ]
    },
    profiles: {
      id: "profiles",
      kind: "table",
      x: 1080,
      y: 20,
      width: 250,
      height: 154,
      label: "profiles",
      alias: "profiles",
      databaseId: "db",
      fields: [
        { id: "field_4", text: "id pk" },
        { id: "field_5", text: "email" },
        { id: "field_6", text: "status" }
      ]
    },
    c1: {
      id: "c1",
      kind: "connection",
      fromId: "client",
      toId: "edge",
      cardinality: "one-to-many",
      label: "HTTPS"
    },
    c2: {
      id: "c2",
      kind: "connection",
      fromId: "edge",
      toId: "api",
      cardinality: "one-to-many",
      label: "routes requests"
    },
    c3: {
      id: "c3",
      kind: "connection",
      fromId: "api",
      toId: "cache",
      cardinality: "many-to-one",
      label: "hot reads"
    },
    c4: {
      id: "c4",
      kind: "connection",
      fromId: "api",
      toId: "db",
      cardinality: "many-to-one",
      label: "transactions"
    },
    c5: {
      id: "c5",
      kind: "connection",
      fromId: "api",
      toId: "worker",
      cardinality: "one-to-many",
      label: "enqueue jobs"
    },
    c6: {
      id: "c6",
      kind: "connection",
      fromId: "profiles",
      toId: "events",
      fromFieldId: "field_4",
      toFieldId: "field_2",
      fromFieldSide: "right",
      toFieldSide: "left",
      cardinality: "one-to-many",
      label: ""
    }
  }
};
