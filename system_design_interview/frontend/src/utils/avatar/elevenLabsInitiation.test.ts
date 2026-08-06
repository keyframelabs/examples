import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ElevenLabs conversation initiation", () => {
  it("sends the selected interview packet before the conversation begins", async () => {
    const sockets: MockWebSocket[] = [];

    class RecordingWebSocket extends MockWebSocket {
      constructor(url: string | URL) {
        super(url);
        sockets.push(this);
        queueMicrotask(() => this.onopen?.(new Event("open")));
      }
    }

    vi.stubGlobal("HTMLElement", class HTMLElement {});
    vi.stubGlobal("WebSocket", RecordingWebSocket);

    const { ElevenLabsAgent } = await import("@keyframelabs/elements");
    const agent = new ElevenLabsAgent();
    await agent.connect({
      agentId: "agent_123",
      signedUrl: "wss://elevenlabs.example/conversation",
      dynamicVariables: {
        interview_packet: "# Design a distributed log\n\nPrivate interviewer reference"
      }
    });

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe("wss://elevenlabs.example/conversation");
    expect(sockets[0]?.sent).toEqual([
      JSON.stringify({
        type: "conversation_initiation_client_data",
        dynamic_variables: {
          interview_packet: "# Design a distributed log\n\nPrivate interviewer reference"
        }
      })
    ]);

    agent.close();
  });
});

class MockWebSocket {
  readonly url: string;
  readonly sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}
}
