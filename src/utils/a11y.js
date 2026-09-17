/**
 * Accessibility helpers used across the app.
 */

export const A11Y_SPEAK_EVENT = "ai-assistive:speak";
export const A11Y_STOP_SPEAK_EVENT = "ai-assistive:stop-speak";

export const SPEAK_PRIORITY = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/**
 * Send text to the speech synthesis queue.
 */
export function announce(text, { priority = SPEAK_PRIORITY.NORMAL, language } = {}) {
  if (!text) return;

  window.dispatchEvent(
    new CustomEvent(A11Y_SPEAK_EVENT, {
      detail: { text, priority, language },
    })
  );
}

export function stopSpeaking() {
  window.dispatchEvent(new CustomEvent(A11Y_STOP_SPEAK_EVENT));
}

/**
 * Push a message into a screen-reader-only live region.
 */
export function announceStatus(message, mode = "polite") {
  let region = document.getElementById(
    mode === "assertive"
      ? "a11y-live-assertive"
      : "a11y-live-polite"
  );

  if (!region) {
    region = document.createElement("div");
    region.id =
      mode === "assertive"
        ? "a11y-live-assertive"
        : "a11y-live-polite";
    region.setAttribute("aria-live", mode);
    region.setAttribute("aria-atomic", "true");
    region.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
    document.body.appendChild(region);
  }

  region.textContent = "";

  return setTimeout(() => {
    region.textContent = message;
  }, 30);
}

/** Focus an element without scrolling. */
export function focusElement(el, { preventScroll = true } = {}) {
  if (!el) return;
  if (typeof el.focus !== "function") return;

  try {
    el.focus({ preventScroll });
  } catch {
    el.focus();
  }
}

/** Find all focusable elements inside a container. */
export function getFocusable(container) {
  if (!container) return [];

  const SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
  ].join(",");

  return Array.from(container.querySelectorAll(SELECTOR)).filter(
    (el) =>
      !el.hasAttribute("hidden") &&
      el.offsetParent !== null &&
      !el.hasAttribute("aria-hidden")
  );
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
