import { describe, expect, it, vi } from "vitest";

import {
  requestUserCamera,
  stopMediaStream,
  userCameraErrorMessage
} from "@/utils/interview/userCamera";

describe("requestUserCamera", () => {
  it("requests a front-facing video stream without microphone audio", async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    await expect(
      requestUserCamera({ getUserMedia } as unknown as MediaDevices)
    ).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: "user" }
    });
  });

  it("reports browsers without camera APIs", async () => {
    await expect(requestUserCamera(undefined)).rejects.toThrow(
      "Camera access is not supported in this browser."
    );
  });
});

describe("stopMediaStream", () => {
  it("stops every track in the stream", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const stream = {
      getTracks: () => tracks
    } as unknown as MediaStream;

    stopMediaStream(stream);

    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(tracks[1].stop).toHaveBeenCalledOnce();
  });
});

describe("userCameraErrorMessage", () => {
  it("explains that denied camera access is optional", () => {
    expect(userCameraErrorMessage({ name: "NotAllowedError" })).toContain(
      "continue without video"
    );
  });

  it("provides a useful fallback for unknown failures", () => {
    expect(userCameraErrorMessage(new Error("Camera service failed"))).toBe(
      "Camera service failed"
    );
  });
});
