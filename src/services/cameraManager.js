/**
 * Singleton camera manager.
 *
 * React StrictMode in dev mounts effects twice — the first `getUserMedia`
 * is immediately followed by a release + re-request within ~50 ms. Some
 * browsers (Safari iOS, Chrome on some Android devices) haven't released
 * the hardware yet and throw NotReadableError, which used to be
 * misreported as "camera unavailable".
 *
 * This module keeps a single stream alive across React re-mounts, and
 * retries gracefully if the camera is momentarily busy.
 */

let currentStream = null;
let inflightPromise = null;
let subscriberCount = 0;

const CONSTRAINTS_LEVELS = [
  // Level 1 — best quality, back camera
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  // Level 2 — any camera the device offers
  { video: true, audio: false },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getUserMediaWithRetry(level, attempts = 3) {
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    try {
      return await navigator.mediaDevices.getUserMedia(level);
    } catch (err) {
      lastErr = err;

      // Only retry when the camera is momentarily busy — for all
      // other errors (denied, not-found, unsupported) bail out
      // immediately so the UI can give the right message.
      if (
        err.name !== "NotReadableError" &&
        err.name !== "AbortError"
      ) {
        throw err;
      }

      await sleep(250 * (i + 1));
    }
  }

  throw lastErr;
}

async function acquireStream() {
  if (currentStream) {
    const track = currentStream.getVideoTracks()[0];
    if (track && track.readyState === "live") {
      return currentStream;
    }
    // Stream went stale — clean up and reacquire
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error("getUserMedia unsupported");
      err.name = "UnsupportedError";
      throw err;
    }

    let lastErr;

    for (const level of CONSTRAINTS_LEVELS) {
      try {
        const stream = await getUserMediaWithRetry(level);
        currentStream = stream;
        return stream;
      } catch (err) {
        lastErr = err;

        // OverconstrainedError / TypeError → try the next level
        if (
          err.name === "OverconstrainedError" ||
          err.name === "TypeError"
        ) {
          continue;
        }

        // Any other error is terminal
        throw err;
      }
    }

    throw lastErr;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}

export function retainCamera() {
  subscriberCount++;
}

export function releaseCamera() {
  subscriberCount = Math.max(0, subscriberCount - 1);

  // Only truly stop the hardware when the last consumer goes away.
  // This is what makes StrictMode double-mount harmless.
  if (subscriberCount === 0 && currentStream) {
    currentStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    currentStream = null;
  }
}

export async function getCameraStream() {
  return acquireStream();
}

export function isCameraLive() {
  if (!currentStream) return false;
  const track = currentStream.getVideoTracks()[0];
  return Boolean(track && track.readyState === "live");
}

/**
 * Translate a native getUserMedia error into a UI-friendly code.
 * The returned code matches the translation keys in translations.js.
 */
export function classifyCameraError(err) {
  const name = err?.name || "Error";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "camera-permission";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "camera-not-found";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "camera-in-use";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "camera-constraints";
  }
  if (name === "UnsupportedError") {
    return "camera-unsupported";
  }
  return "camera-unknown";
}
