import { describe, expect, it } from "vitest";
import {
  canvasReducer,
  createConnection,
  createEmptyCanvasState,
  createField,
  createNode
} from "@/components/canvas/model/state";
import {
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_TOP,
  tableHeightForFields
} from "@/components/canvas/model/tableLayout";

describe("canvas state model", () => {
  it("adds and selects nodes deterministically", () => {
    const empty = createEmptyCanvasState();
    const service = createNode("service", 10, 20, {
      id: "api",
      label: "API Gateway"
    });

    const state = canvasReducer(empty, {
      type: "add-node",
      node: service,
      select: true
    });

    expect(state.order).toEqual(["api"]);
    expect(state.selectedIds).toEqual(["api"]);
    expect(state.elements.api).toMatchObject({
      kind: "service",
      x: 10,
      y: 20,
      label: "API Gateway"
    });
    expect(canvasReducer(state, { type: "select", ids: ["api"] })).toBe(
      state
    );
  });

  it("applies node and edge selection changes atomically in canvas order", () => {
    const api = createNode("service", 0, 0, { id: "api" });
    const db = createNode("database", 240, 0, { id: "db" });
    const connection = { ...createConnection("api", "db"), id: "c1" };
    const withNodes = [api, db].reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );
    const state = canvasReducer(
      canvasReducer(withNodes, {
        type: "add-connection",
        connection,
        select: false
      }),
      { type: "select", ids: ["db"] }
    );

    const selected = canvasReducer(state, {
      type: "change-selection",
      changes: [
        { id: "db", selected: false },
        { id: "c1", selected: true },
        { id: "api", selected: true },
        { id: "missing", selected: true }
      ]
    });

    expect(selected.selectedIds).toEqual(["api", "c1"]);
    expect(
      canvasReducer(selected, {
        type: "change-selection",
        changes: [
          { id: "api", selected: true },
          { id: "c1", selected: true }
        ]
      })
    ).toBe(selected);
  });

  it("updates multiple node geometries atomically", () => {
    const api = createNode("service", 0, 0, { id: "api" });
    const db = createNode("database", 240, 0, { id: "db" });
    const state = [api, db].reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );

    const moved = canvasReducer(state, {
      type: "update-node-geometries",
      geometries: [
        { id: "api", x: 20, y: 30 },
        { id: "db", x: 280, y: 30, width: 220, height: 140 }
      ]
    });

    expect(moved.elements.api).toMatchObject({ x: 20, y: 30 });
    expect(moved.elements.db).toMatchObject({
      x: 280,
      y: 30,
      width: 220,
      height: 140
    });
    expect(state.elements.api).toMatchObject({ x: 0, y: 0 });
  });

  it("deletes attached connections when a node is deleted", () => {
    const api = createNode("service", 0, 0, { id: "api" });
    const db = createNode("database", 240, 0, { id: "db" });
    const connection = { ...createConnection("api", "db", "reads"), id: "c1" };
    const withNodes = [api, db].reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );
    const state = canvasReducer(withNodes, {
      type: "add-connection",
      connection,
      select: false
    });

    const deleted = canvasReducer(state, {
      type: "delete-elements",
      ids: ["api"]
    });

    expect(deleted.order).toEqual(["db"]);
    expect(deleted.elements.api).toBeUndefined();
    expect(deleted.elements.c1).toBeUndefined();
  });

  it("creates field-level connections with cardinality metadata", () => {
    const connection = createConnection("users", "profiles", "maps", {
      fromFieldId: "field_1",
      toFieldId: "field_2",
      cardinality: "one-to-many"
    });

    expect(connection).toMatchObject({
      kind: "connection",
      fromId: "users",
      toId: "profiles",
      fromFieldId: "field_1",
      toFieldId: "field_2",
      cardinality: "one-to-many",
      label: "maps"
    });
  });

  it("removes connections attached to a deleted table field", () => {
    const users = createNode("table", 0, 0, {
      id: "users",
      fields: [
        createField({ id: "user_id", text: "id" }),
        createField({ id: "email", text: "email" })
      ]
    });
    const profiles = createNode("table", 320, 0, {
      id: "profiles",
      fields: [createField({ id: "profile_user_id", text: "user_id" })]
    });
    let state = [users, profiles].reduce(
      (next, node) =>
        canvasReducer(next, { type: "add-node", node, select: false }),
      createEmptyCanvasState()
    );

    for (const connection of [
      {
        ...createConnection("users", "profiles", "", {
          fromFieldId: "user_id",
          toFieldId: "profile_user_id"
        }),
        id: "user_profile"
      },
      {
        ...createConnection("profiles", "users", "", {
          fromFieldId: "profile_user_id",
          toFieldId: "user_id"
        }),
        id: "profile_user"
      },
      {
        ...createConnection("users", "profiles", "", {
          fromFieldId: "email"
        }),
        id: "email_profile"
      }
    ]) {
      state = canvasReducer(state, {
        type: "add-connection",
        connection,
        select: false
      });
    }

    const updated = canvasReducer(
      { ...state, selectedIds: ["user_profile"] },
      { type: "remove-table-field", tableId: "users", fieldId: "user_id" }
    );

    expect(updated.elements.users).toMatchObject({
      fields: [{ id: "email", text: "email" }]
    });
    expect(updated.elements.user_profile).toBeUndefined();
    expect(updated.elements.profile_user).toBeUndefined();
    expect(updated.elements.email_profile).toBeDefined();
    expect(updated.selectedIds).toEqual([]);
  });

  it("creates new objects and rows without generic stored names", () => {
    for (const kind of [
      "actor",
      "service",
      "database",
      "table",
      "text"
    ] as const) {
      const node = createNode(kind, 0, 0);
      expect(node.label).toBe("");
      if (node.kind === "table") {
        expect(node.fields).toHaveLength(1);
        expect(node.fields[0]).toMatchObject({
          text: "",
          primaryKey: false,
          foreignKey: false
        });
      }
    }
    const firstField = createField();
    const secondField = createField();
    expect(firstField).toMatchObject({
      text: "",
      primaryKey: false,
      foreignKey: false
    });
    expect(firstField.id).not.toBe("field_1");
    expect(secondField.id).not.toBe(firstField.id);
  });

  it("persists independent PK and FK state on a table row", () => {
    const table = createNode("table", 0, 0, {
      id: "table",
      fields: [
        createField({
          id: "row",
          text: "account_id",
          primaryKey: true,
          foreignKey: true
        })
      ]
    });
    const state = canvasReducer(createEmptyCanvasState(), {
      type: "add-node",
      node: table,
      select: false
    });

    expect(state.elements.table).toMatchObject({
      fields: [
        {
          id: "row",
          text: "account_id",
          primaryKey: true,
          foreignKey: true
        }
      ]
    });
  });

  it("creates tables with a blank optional type", () => {
    const table = createNode("table", 0, 0, { id: "table" });

    expect(table).toMatchObject({
      kind: "table",
      tableType: ""
    });
  });

  it("expands new tables to fit additional fields", () => {
    const fields = Array.from({ length: 7 }, (_, index) => ({
      id: `field_${index + 1}`,
      text: `field_${index + 1}`
    }));

    const table = createNode("table", 0, 0, {
      id: "table",
      fields,
      height: 80
    });

    expect(table).toMatchObject({
      kind: "table",
      height: tableHeightForFields(fields)
    });
  });

  it("expands existing tables when fields are added", () => {
    const table = createNode("table", 0, 0, {
      id: "table",
      height: 150
    });
    const state = canvasReducer(createEmptyCanvasState(), {
      type: "add-node",
      node: table,
      select: false
    });
    const fields = Array.from({ length: 8 }, (_, index) => ({
      id: `field_${index + 1}`,
      text: `field_${index + 1}`
    }));

    const updated = canvasReducer(state, {
      type: "update-element",
      id: "table",
      patch: { fields }
    });

    expect(updated.elements.table).toMatchObject({
      kind: "table",
      height: tableHeightForFields(fields)
    });
    expect(tableHeightForFields(fields) - TABLE_FIELD_TOP - 10).toBeGreaterThanOrEqual(
      fields.length * TABLE_FIELD_HEIGHT
    );
  });

});
