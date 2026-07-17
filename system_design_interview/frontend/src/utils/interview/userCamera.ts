const USER_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user"
  }
};

export async function requestUserCamera(
  mediaDevices: MediaDevices | undefined = browserMediaDevices()
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported in this browser.");
  }

  return mediaDevices.getUserMedia(USER_CAMERA_CONSTRAINTS);
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function hasLiveVideoTrack(
  stream: MediaStream | null
): stream is MediaStream {
  return stream?.getVideoTracks().some((track) => track.readyState === "live")
    ?? false;
}

export function setMediaStreamVideoEnabled(
  stream: MediaStream,
  enabled: boolean
): void {
  stream.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export function userCameraErrorMessage(error: unknown): string {
  const name = errorName(error);

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. You can allow it in your browser settings or continue without video.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found. You can continue without video.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your camera is already in use or unavailable. Close other camera apps and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Your camera could not satisfy the requested video settings. You can continue without video.";
    default:
      return error instanceof Error
        ? error.message
        : "The camera could not be started. You can continue without video.";
  }
}

export function isMissingUserCameraError(error: unknown): boolean {
  const name = errorName(error);
  return name === "NotFoundError" || name === "DevicesNotFoundError";
}

function browserMediaDevices(): MediaDevices | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }

  return typeof error.name === "string" ? error.name : undefined;
}
