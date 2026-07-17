import { describe, expect, it, vi } from "vitest";

import {
  hasLiveVideoTrack,
  isMissingUserCameraError,
  requestUserCamera,
  setMediaStreamVideoEnabled,
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

describe("camera track toggling", () => {
  it("disables and re-enables video tracks without stopping them", () => {
    const tracks = [
      { enabled: true, readyState: "live", stop: vi.fn() },
      { enabled: true, readyState: "live", stop: vi.fn() }
    ];
    const stream = {
      getVideoTracks: () => tracks
    } as unknown as MediaStream;

    setMediaStreamVideoEnabled(stream, false);

    expect(tracks.every((track) => !track.enabled)).toBe(true);
    expect(tracks.every((track) => !track.stop.mock.calls.length)).toBe(true);
    expect(hasLiveVideoTrack(stream)).toBe(true);

    setMediaStreamVideoEnabled(stream, true);

    expect(tracks.every((track) => track.enabled)).toBe(true);
    expect(tracks.every((track) => !track.stop.mock.calls.length)).toBe(true);
  });

  it("does not reuse a stream whose video tracks have ended", () => {
    const stream = {
      getVideoTracks: () => [{ readyState: "ended" }]
    } as unknown as MediaStream;

    expect(hasLiveVideoTrack(stream)).toBe(false);
    expect(hasLiveVideoTrack(null)).toBe(false);
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

describe("isMissingUserCameraError", () => {
  it("recognizes browser errors that mean no camera is present", () => {
    expect(isMissingUserCameraError({ name: "NotFoundError" })).toBe(true);
    expect(isMissingUserCameraError({ name: "DevicesNotFoundError" })).toBe(
      true
    );
    expect(isMissingUserCameraError({ name: "NotAllowedError" })).toBe(false);
  });
});
