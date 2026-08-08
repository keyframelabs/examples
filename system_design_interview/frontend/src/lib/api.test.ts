import { afterEach, describe, expect, it, vi } from "vitest";

import { createLiveSession, getInterviewPackets } from "@/lib/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CATALOG = {
  interviews: [
    {
      packetId: "google-calendar-system-design",
      title: "Google Calendar",
      skillLevel: "Junior"
    }
  ]
};

const SESSION = {
  sessionDetails: {
    server_url: "wss://keyframe.example/live",
    participant_token: "participant-token",
    agent_identity: "avatar-agent"
  },
  voiceAgentDetails: {
    type: "elevenlabs",
    agent_id: "agent_123",
    signed_url: "wss://elevenlabs.example/live",
    dynamic_variables: {
      interview_packet: "# Design a distributed log"
    }
  }
};

describe("interview API", () => {
  it("loads the public catalog contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(CATALOG));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInterviewPackets()).resolves.toEqual(CATALOG.interviews);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8788/api/interviews",
      { signal: undefined }
    );
  });

  it("surfaces the server error envelope on failed requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Unknown interview packet: nope" })
      } as Response)
    );

    await expect(createLiveSession("nope")).rejects.toThrow(
      "Unknown interview packet: nope"
    );
  });

  it("retries transient catalog network failures, but not HTTP errors", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(okResponse(CATALOG));
    vi.stubGlobal("fetch", fetchMock);

    const packetsRequest = getInterviewPackets();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await expect(packetsRequest).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when the caller aborts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const packetsRequest = getInterviewPackets(controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(packetsRequest).rejects.toThrow();
    const callsAfterAbort = fetchMock.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(fetchMock.mock.calls.length).toBe(callsAfterAbort);
  });

  it("passes the selected packet ID when creating a session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(SESSION));
    vi.stubGlobal("fetch", fetchMock);

    await createLiveSession("kafka-like-distributed-log");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8788/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId: "kafka-like-distributed-log" })
    });
  });

  it("rejects session responses missing live avatar credentials", async () => {
    const { dynamic_variables, ...incompleteVoiceAgent } =
      SESSION.voiceAgentDetails;
    void dynamic_variables;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ ...SESSION, voiceAgentDetails: incompleteVoiceAgent })
      )
    );

    await expect(
      createLiveSession("kafka-like-distributed-log")
    ).rejects.toThrow("Session response was missing live avatar credentials.");
  });
});

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
