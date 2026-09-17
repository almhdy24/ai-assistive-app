import { useCallback, useEffect, useRef, useState } from "react";

import {
  retainCamera,
  releaseCamera,
  getCameraStream,
  isCameraLive,
  classifyCameraError,
} from "../services/cameraManager";

export function useCamera() {
  const videoRef = useRef(null);
  const mountedRef = useRef(true);

  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | prompting | granted | error
  const [errorCode, setErrorCode] = useState(null);

  /* Reserve our slot in the singleton manager on mount. */
  useEffect(() => {
    retainCamera();
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      releaseCamera();
    };
  }, []);

  const attachStreamToVideo = useCallback(async (stream) => {
    const el = videoRef.current;
    if (!el) return false;

    el.srcObject = stream;

    try {
      await el.play();
    } catch {
      /* autoplay may briefly reject — the stream still renders */
    }

    return true;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorCode("camera-unsupported");
      return false;
    }

    // If the singleton already owns a live stream, reuse it.
    if (isCameraLive()) {
      const stream = await getCameraStream();
      if (!mountedRef.current) return false;
      await attachStreamToVideo(stream);
      if (!mountedRef.current) return false;
      setActive(true);
      setReady(true);
      setStatus("granted");
      setErrorCode(null);
      return true;
    }

    setStatus("prompting");
    setErrorCode(null);
    setReady(false);

    try {
      const stream = await getCameraStream();

      if (!mountedRef.current) return false;

      await attachStreamToVideo(stream);

      if (!mountedRef.current) return false;

      setActive(true);
      setReady(true);
      setStatus("granted");
      setErrorCode(null);
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;

      const code = classifyCameraError(err);

      console.warn("[camera] failed:", err.name, err.message, "→", code);

      setActive(false);
      setReady(false);
      setStatus("error");
      setErrorCode(code);
      return false;
    }
  }, [attachStreamToVideo]);

  const stop = useCallback(() => {
    // Only detach the video element; the singleton keeps the hardware
    // alive until every consumer releases.
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
    setReady(false);
    setStatus("idle");
    setErrorCode(null);
  }, []);

  const capture = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.videoWidth) return null;

    const maxW = 1280;
    let w = el.videoWidth;
    let h = el.videoHeight;

    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(el, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72).split(",")[1];
  }, []);

  return {
    videoRef,
    active,
    ready,
    status,
    errorCode,
    start,
    stop,
    capture,
  };
}
