import { useEffect, useRef } from "react";

/**
 * Keep the screen awake while the assistant is in use.
 * Screen sleeping mid-analysis is disorienting for blind users.
 */
export function useWakeLock(active = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined") return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        ref.current = lock;
      } catch {
        /* user gesture required or unsupported */
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
      ref.current?.release?.().catch(() => {});
      ref.current = null;
    };
  }, [active]);
}
