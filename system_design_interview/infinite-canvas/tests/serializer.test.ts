import { describe, expect, it } from "vitest";

import { serializeCanvasToText } from "#/canvas/serializer/serializeCanvas";
import {
  CANVAS_SCHEMA_VERSION,
  type CanvasElement,
  type CanvasState
} from "#/canvas/model/types";

describe("serializeCanvasToText", () => {
  it("serializes an empty canvas", () => {
    const result = serializeCanvasToText(state([]));

    expect(result.text).toBe("Canvas v8");
    expect(result.metadata).toEqual({
      version: CANVAS_SCHEMA_VERSION,
      nodeCount: 0,
      tableCount: 0,
      connectionCount: 0,
      characterCount: result.text.length
    });
  });

  it("serializes a simple architecture", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "actor-1",
          kind: "actor",
          x: 0,
          y: 0,
          width: 150,
          height: 74,
          label: "Customer"
        },
        {
          id: "service-1",
          kind: "service",
          x: 220,
          y: 0,
          width: 180,
          height: 96,
          label: "API Gateway"
        },
        {
          id: "database-1",
          kind: "database",
          x: 460,
          y: 0,
          width: 170,
          height: 112,
          label: "Main Postgres",
          alias: "pg"
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "actor-1",
          toId: "service-1",
          label: "HTTPS"
        },
        {
          id: "conn-2",
          kind: "connection",
          fromId: "service-1",
          toId: "database-1",
          label: ""
        }
      ])
    );

    expect(result.text).toBe(
      [
        "Canvas v8",
        "Nodes:",
        "actor customer: Customer",
        "service api_gateway: API Gateway",
        "database pg: Main Postgres",
        "Connections:",
        "customer -> api_gateway: HTTPS",
        "api_gateway -> pg"
      ].join("\n")
    );
    expect(result.metadata.nodeCount).toBe(3);
    expect(result.metadata.tableCount).toBe(0);
    expect(result.metadata.connectionCount).toBe(2);
    expect(result.metadata.characterCount).toBe(result.text.length);
  });

  it("serializes table schemas with database-qualified aliases", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "database-1",
          kind: "database",
          x: 0,
          y: 0,
          width: 170,
          height: 112,
          label: "Core DB",
          alias: "core"
        },
        {
          id: "table-1",
          kind: "table",
          x: 240,
          y: 0,
          width: 210,
          height: 150,
          label: "Accounts",
          tableType: "entity",
          fields: [
            { id: "field-1", text: "id" },
            { id: "field-2", text: "email" },
            { id: "field-3", text: "created_at" }
          ],
          databaseId: "database-1"
        },
        {
          id: "table-2",
          kind: "table",
          x: 240,
          y: 180,
          width: 210,
          height: 150,
          label: "Audit Events",
          alias: "events",
          fields: [
            { id: "field-4", text: "id" },
            { id: "field-5", text: "account_id fk" },
            { id: "field-6", text: "created_at" }
          ],
          databaseId: "database-1"
        }
      ])
    );

    expect(result.text).toBe(
      [
        "Canvas v8",
        "Nodes:",
        "database core: Core DB",
        "Tables:",
        "core.accounts<entity>(id, email, created_at)",
        "core.events(id, account_id fk, created_at)"
      ].join("\n")
    );
    expect(result.metadata.nodeCount).toBe(3);
    expect(result.metadata.tableCount).toBe(2);
    expect(result.metadata.connectionCount).toBe(0);
  });

  it("serializes labels and disambiguates connection endpoints", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "actor-1",
          kind: "actor",
          x: 0,
          y: 0,
          width: 150,
          height: 74,
          label: "Client"
        },
        {
          id: "service-1",
          kind: "service",
          x: 220,
          y: 0,
          width: 180,
          height: 96,
          label: "API"
        },
        {
          id: "service-2",
          kind: "service",
          x: 440,
          y: 0,
          width: 180,
          height: 96,
          label: "API"
        },
        {
          id: "label-1",
          kind: "text",
          x: 220,
          y: 120,
          width: 190,
          height: 76,
          label: "Critical Path",
          fontSize: 16
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "actor-1",
          toId: "service-1",
          label: "calls"
        },
        {
          id: "conn-2",
          kind: "connection",
          fromId: "service-1",
          toId: "service-2",
          label: ""
        },
        {
          id: "conn-3",
          kind: "connection",
          fromId: "service-2",
          toId: "service-1",
          label: "retries"
        }
      ])
    );

    expect(result.text).toBe(
      [
        "Canvas v8",
        "Nodes:",
        "actor client: Client",
        "service api: API",
        "service api_2: API",
        "Labels:",
        "critical_path: Critical Path",
        "Connections:",
        "client -> api: calls",
        "api -> api_2",
        "api_2 -> api: retries"
      ].join("\n")
    );
    expect(result.metadata.nodeCount).toBe(4);
    expect(result.metadata.tableCount).toBe(0);
    expect(result.metadata.connectionCount).toBe(3);
  });

  it("uses database-qualified table aliases in connections", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "service-1",
          kind: "service",
          x: 0,
          y: 0,
          width: 180,
          height: 96,
          label: "Auth Service",
          alias: "auth"
        },
        {
          id: "database-1",
          kind: "database",
          x: 240,
          y: 0,
          width: 170,
          height: 112,
          label: "Postgres",
          alias: "db"
        },
        {
          id: "table-1",
          kind: "table",
          x: 240,
          y: 160,
          width: 210,
          height: 150,
          label: "users",
          fields: [
            { id: "field-1", text: "id pk" },
            { id: "field-2", text: "email" }
          ],
          databaseId: "database-1"
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "service-1",
          toId: "table-1",
          label: "reads user"
        }
      ])
    );

    expect(result.text).toBe(
      [
        "Canvas v8",
        "Nodes:",
        "service auth: Auth Service",
        "database db: Postgres",
        "Tables:",
        "db.users(id pk, email)",
        "Connections:",
        "auth -> db.users: reads user"
      ].join("\n")
    );
  });

  it("serializes field-level table connections with cardinality", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "database-1",
          kind: "database",
          x: 0,
          y: 0,
          width: 170,
          height: 112,
          label: "Core DB",
          alias: "core"
        },
        {
          id: "table-1",
          kind: "table",
          x: 240,
          y: 0,
          width: 210,
          height: 150,
          label: "accounts",
          fields: [
            { id: "field-id", text: "id pk" },
            { id: "field-email", text: "email" }
          ],
          databaseId: "database-1"
        },
        {
          id: "table-2",
          kind: "table",
          x: 240,
          y: 180,
          width: 210,
          height: 150,
          label: "events",
          fields: [
            { id: "field-id", text: "id pk" },
            { id: "field-account", text: "account_id fk" },
            { id: "field-value", text: "value" }
          ],
          databaseId: "database-1"
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "table-1",
          toId: "table-2",
          fromFieldId: "field-id",
          toFieldId: "field-account",
          cardinality: "one-to-many",
          label: "foreign key"
        }
      ])
    );

    expect(result.text).toContain(
      "core.accounts.id -> core.events.account_id [1:N]"
    );
    expect(result.text).not.toContain("foreign key");
    expect(result.metadata.connectionCount).toBe(1);
  });

  it("serializes many-at-origin cardinality", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "service-1",
          kind: "service",
          x: 0,
          y: 0,
          width: 180,
          height: 96,
          label: "Workers",
          alias: "workers"
        },
        {
          id: "service-2",
          kind: "service",
          x: 240,
          y: 0,
          width: 180,
          height: 96,
          label: "Queue",
          alias: "queue"
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "service-1",
          toId: "service-2",
          cardinality: "many-to-one",
          label: "consume"
        }
      ])
    );

    expect(result.text).toContain("workers -> queue [N:1]: consume");
  });

  it("serializes simplified table ERD cardinalities without labels", () => {
    const result = serializeCanvasToText(
      state([
        {
          id: "table-1",
          kind: "table",
          x: 0,
          y: 0,
          width: 210,
          height: 150,
          label: "users",
          fields: [{ id: "field-id", text: "id pk" }]
        },
        {
          id: "table-2",
          kind: "table",
          x: 240,
          y: 0,
          width: 210,
          height: 150,
          label: "profiles",
          fields: [{ id: "field-id", text: "id pk" }]
        },
        {
          id: "table-3",
          kind: "table",
          x: 480,
          y: 0,
          width: 210,
          height: 150,
          label: "events",
          fields: [{ id: "field-id", text: "id pk" }]
        },
        {
          id: "conn-1",
          kind: "connection",
          fromId: "table-1",
          toId: "table-2",
          cardinality: "one-to-one",
          label: "profile"
        },
        {
          id: "conn-2",
          kind: "connection",
          fromId: "table-1",
          toId: "table-3",
          cardinality: "one-to-many",
          label: "events"
        },
        {
          id: "conn-3",
          kind: "connection",
          fromId: "table-2",
          toId: "table-3",
          cardinality: "many-to-many",
          label: "links"
        }
      ])
    );

    expect(result.text).toContain("users -> profiles [1:1]");
    expect(result.text).toContain("users -> events [1:N]");
    expect(result.text).toContain("profiles -> events [N:N]");
    expect(result.text).not.toContain(": profile");
    expect(result.text).not.toContain(": events");
    expect(result.text).not.toContain(": links");
  });
});

function state(
  elements: CanvasElement[],
  order = elements.map((element) => element.id)
): CanvasState {
  return {
    version: CANVAS_SCHEMA_VERSION,
    elements: Object.fromEntries(
      elements.map((element) => [element.id, element])
    ) as Record<string, CanvasElement>,
    order,
    selectedIds: []
  };
}
