import { useCallback } from "react";

/**
 * Haptic feedback (vibration) — critical for blind users.
 *
 * Different patterns communicate different outcomes:
 *   tap       → button press confirmation
 *   success   → operation completed
 *   warning   → something needs attention
 *   error     → failure
 *   ready     → camera is live and listening
 */
export function useHaptics() {
  const vibrate = useCallback((pattern) => {
    if (typeof navigator === "undefined") return;
    if (!navigator.vibrate) return;

    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore — some browsers reject silently */
    }
  }, []);

  return {
    tap: () => vibrate(15),
    success: () => vibrate([0, 30, 40, 30]),
    warning: () => vibrate([0, 60, 40, 60]),
    error: () => vibrate([0, 100, 40, 100, 40, 100]),
    ready: () => vibrate([0, 20]),
    longPress: () => vibrate([0, 40, 60, 40]),
  };
}
