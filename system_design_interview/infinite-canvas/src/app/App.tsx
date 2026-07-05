import { useCallback, useState } from "react";
import { SystemDesignCanvas } from "../canvas";
import type { CanvasState, CanvasTextMetadata } from "../canvas";

const initialState: CanvasState = {
  version: 8,
  selectedIds: [],
  order: ["user", "api", "auth", "db", "users", "keyValues", "c1", "c2", "c3", "c4"],
  elements: {
    user: {
      id: "user",
      kind: "actor",
      x: -20,
      y: 40,
      width: 160,
      height: 78,
      label: "Mobile user",
      alias: "user"
    },
    api: {
      id: "api",
      kind: "service",
      x: 260,
      y: 30,
      width: 190,
      height: 96,
      label: "API Gateway",
      alias: "api"
    },
    auth: {
      id: "auth",
      kind: "service",
      x: 570,
      y: 30,
      width: 190,
      height: 96,
      label: "Auth Service",
      alias: "auth"
    },
    db: {
      id: "db",
      kind: "database",
      x: 850,
      y: 12,
      width: 175,
      height: 120,
      label: "Postgres",
      alias: "db"
    },
    users: {
      id: "users",
      kind: "table",
      x: 820,
      y: 210,
      width: 230,
      height: 154,
      label: "users",
      alias: "users",
      tableType: "",
      databaseId: "db",
      fields: [
        { id: "field_1", text: "id pk" },
        { id: "field_2", text: "email" },
        { id: "field_3", text: "created_at" }
      ]
    },
    keyValues: {
      id: "keyValues",
      kind: "table",
      x: 1110,
      y: 210,
      width: 250,
      height: 154,
      label: "key_value_map",
      alias: "kv",
      tableType: "",
      databaseId: "db",
      fields: [
        { id: "field_1", text: "key pk" },
        { id: "field_2", text: "name" },
        { id: "field_3", text: "value" }
      ]
    },
    c1: {
      id: "c1",
      kind: "connection",
      fromId: "user",
      toId: "api",
      cardinality: "one-to-many",
      label: "HTTPS requests"
    },
    c2: {
      id: "c2",
      kind: "connection",
      fromId: "api",
      toId: "auth",
      cardinality: "one-to-one",
      label: "validates token"
    },
    c3: {
      id: "c3",
      kind: "connection",
      fromId: "auth",
      toId: "users",
      cardinality: "one-to-many",
      label: "reads user"
    },
    c4: {
      id: "c4",
      kind: "connection",
      fromId: "users",
      toId: "keyValues",
      fromFieldId: "field_1",
      toFieldId: "field_1",
      cardinality: "one-to-many",
      label: ""
    }
  }
};

export function App() {
  const [canvasText, setCanvasText] = useState("Canvas v8");
  const [metadata, setMetadata] = useState<CanvasTextMetadata | null>(null);

  const handleCanvasTextChange = useCallback(
    (text: string, nextMetadata: CanvasTextMetadata) => {
      setCanvasText(text);
      setMetadata(nextMetadata);
    },
    []
  );

  return (
    <main className="flex h-screen min-h-screen flex-col bg-slate-100 text-slate-900">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-[520px] flex-1">
          <SystemDesignCanvas
            initialState={initialState}
            onCanvasTextChange={handleCanvasTextChange}
          />
        </div>
        <aside className="flex max-h-72 w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold">LLM context</h2>
            {metadata && (
              <span className="text-xs font-medium text-slate-500">
                v{metadata.version}
              </span>
            )}
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-[13px] leading-5 text-slate-800">
            {canvasText}
          </pre>
        </aside>
      </div>
    </main>
  );
}
