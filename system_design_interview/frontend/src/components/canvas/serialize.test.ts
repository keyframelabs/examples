import { describe, expect, it } from "vitest";

import {
  EMPTY_CANVAS_TEXT,
  serializeCanvasToText
} from "@/components/canvas/serialize";
import {
  testEdge,
  testField,
  testNode,
  testTable
} from "@/components/canvas/testBuilders";

describe("serializeCanvasToText", () => {
  it("serializes an empty canvas to just the version header", () => {
    expect(serializeCanvasToText({ nodes: [], edges: [] })).toBe(
      EMPTY_CANVAS_TEXT
    );
    expect(EMPTY_CANVAS_TEXT).toBe("Canvas v12");
  });

  it("serializes a full architecture into the stable text contract", () => {
    const client = testNode("service", { label: "Client" });
    const api = testNode("service", { label: "API Gateway" });
    const database = testNode("database", { label: "Postgres" });
    const users = testTable({
      label: "Users",
      fields: [
        testField("f1", "id", { primaryKey: true }),
        testField("f2", "email")
      ]
    });
    const note = testNode("text", { label: "  Scale  later  " });
    const edges = [
      testEdge(client, api, { label: "HTTP request", cardinality: "one-to-many" }),
      testEdge(api, database)
    ];

    expect(
      serializeCanvasToText({
        nodes: [client, api, database, users, note],
        edges
      })
    ).toBe(
      [
        "Canvas v12",
        "Nodes:",
        "service client: Client",
        "service api_gateway: API Gateway",
        "database postgres: Postgres",
        "Tables:",
        "users(id pk, email)",
        "Labels:",
        "scale_later: Scale later",
        "Connections:",
        "client -> api_gateway [1:N]: HTTP request",
        "api_gateway -> postgres [1:1]"
      ].join("\n")
    );
  });

  it("disambiguates duplicate names with numeric suffixes", () => {
    const first = testNode("service", { label: "Cache" });
    const second = testNode("service", { label: "Cache" });
    const unnamed = testNode("service");

    expect(
      serializeCanvasToText({ nodes: [first, second, unnamed], edges: [] })
    ).toBe(
      [
        "Canvas v12",
        "Nodes:",
        "service cache: Cache",
        "service cache_2: Cache",
        "service service: "
      ].join("\n")
    );
  });

  it("serializes field-level table relationships without labels", () => {
    const users = testTable({
      label: "Users",
      fields: [testField("uid", "id", { primaryKey: true })]
    });
    const orders = testTable({
      label: "Orders",
      fields: [testField("ouid", "user_id", { foreignKey: true })]
    });
    const relationship = testEdge(users, orders, {
      label: "ignored for table relationships",
      cardinality: "one-to-many",
      sourceFieldId: "uid",
      targetFieldId: "ouid"
    });

    expect(
      serializeCanvasToText({ nodes: [users, orders], edges: [relationship] })
    ).toBe(
      [
        "Canvas v12",
        "Tables:",
        "users(id pk)",
        "orders(user_id fk)",
        "Connections:",
        "users.id -> orders.user_id [1:N]"
      ].join("\n")
    );
  });

  it("derives field aliases from the first token of the field text", () => {
    const users = testTable({
      label: "Users",
      fields: [testField("uid", "id: uuid primary")]
    });
    const sessions = testNode("service", { label: "Sessions" });
    const edge = testEdge(users, sessions, { sourceFieldId: "uid" });

    expect(
      serializeCanvasToText({ nodes: [users, sessions], edges: [edge] })
    ).toContain("users.id -> sessions [1:1]");
  });
});
