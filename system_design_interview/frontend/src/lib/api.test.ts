import { afterEach, describe, expect, it, vi } from "vitest";

import { createLiveSession, getInterviewPackets } from "@/lib/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("interview API", () => {
  it("loads the public catalog contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({
      interviews: [
        {
          packetId: "google-calendar-system-design",
          title: "Google Calendar",
          skillLevel: "Junior"
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInterviewPackets()).resolves.toEqual([
      {
        packetId: "google-calendar-system-design",
        title: "Google Calendar",
        skillLevel: "Junior"
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8788/api/interviews"
    );
  });

  it("accepts intern packets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({
      interviews: [
        {
          packetId: "pastebin-system-design",
          title: "Pastebin",
          skillLevel: "Intern"
        }
      ]
    })));

    await expect(getInterviewPackets()).resolves.toEqual([
      {
        packetId: "pastebin-system-design",
        title: "Pastebin",
        skillLevel: "Intern"
      }
    ]);
  });

  it("retries a transient catalog network failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(okResponse({
        interviews: [
          {
            packetId: "google-calendar-system-design",
            title: "Google Calendar",
            skillLevel: "Junior"
          }
        ]
      }));
    vi.stubGlobal("fetch", fetchMock);

    const packetsRequest = getInterviewPackets();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);

    await expect(packetsRequest).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels catalog retry when the caller aborts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const packetsRequest = getInterviewPackets(controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(packetsRequest).rejects.toMatchObject({
      name: "AbortError"
    });
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the selected packet ID when creating a session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({
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
          interview_packet: "# Design a distributed log\n\nPrivate interviewer reference"
        }
      }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createLiveSession("kafka-like-distributed-log");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8788/api/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packetId: "kafka-like-distributed-log" })
      }
    );
  });

  it("requires the selected packet dynamic variable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({
      sessionDetails: {
        server_url: "wss://keyframe.example/live",
        participant_token: "participant-token",
        agent_identity: "avatar-agent"
      },
      voiceAgentDetails: {
        type: "elevenlabs",
        agent_id: "agent_123",
        signed_url: "wss://elevenlabs.example/live"
      }
    })));

    await expect(createLiveSession("kafka-like-distributed-log")).rejects.toThrow(
      "Session response was missing live avatar credentials."
    );
  });

  it("rejects catalog entries outside the expected public shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({
        interviews: [{ packetId: "private-packet", prompt: "hidden" }]
      }))
    );

    await expect(getInterviewPackets()).rejects.toThrow(
      "Interview catalog response was invalid."
    );
  });
});

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
