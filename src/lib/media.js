/*
 * Camera stream helpers shared by the booth and the live screen.
 */

/*
 * True on iOS / iPadOS, where every browser runs Apple's WebKit and
 * the camera has extra restrictions (trusted HTTPS only, one active
 * capture at a time).
 */
export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

/*
 * Turns getUserMedia failures into messages that say what to do.
 */
export function describeCameraError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access for this site and try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use by another app or window. Close it and try again.";
    case "OverconstrainedError":
      return "This camera does not support the requested settings.";
    default:
      return error?.message || "Camera unavailable.";
  }
}

export async function requestCameraStream(facing = "user") {
  if (!navigator.mediaDevices?.getUserMedia) {
    /*
     * iOS Safari hides getUserMedia entirely on origins it does not
     * trust, e.g. a self-signed dev certificate.
     */
    throw new Error(
      window.isSecureContext
        ? "Camera access is not supported by this browser."
        : "The camera needs a trusted HTTPS connection. On iPhone: open /rootCA.pem in Safari, install the profile, then allow full trust under Settings, General, About, Certificate Trust Settings."
    );
  }

  const mediaDevices = navigator.mediaDevices;

  try {
    return await mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (error) {
    /*
     * A few Safari versions reject the size hints; retry with the
     * camera facing only, then with whatever camera is available.
     */
    if (
      error?.name === "OverconstrainedError" ||
      error?.name === "TypeError"
    ) {
      try {
        return await mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
      } catch {
        return mediaDevices.getUserMedia({ video: true, audio: false });
      }
    }

    throw error;
  }
}

/*
 * Reliable video wiring for every browser, including iOS Safari:
 * muted + playsinline are set on the element itself and play() is
 * retried once metadata is ready.
 */
export function attachStreamToVideo(video, stream) {
  if (!video || !stream) return;

  video.muted = true;
  video.setAttribute("playsinline", "");
  video.srcObject = stream;

  const play = () => video.play().catch(() => {});

  play();
  video.onloadedmetadata = play;
}

/*
 * Center-crop rectangle that covers `targetRatio` from a video
 * frame (the same maths as CSS object-fit: cover).
 */
export function getCoverCrop(sourceWidth, sourceHeight, targetRatio) {
  const sourceRatio = sourceWidth / sourceHeight;

  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / targetRatio;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}
