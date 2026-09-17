/**
 * In-app diagnostic ring buffer for TTS lifecycle events.
 * Used by the temporary TtsDiagnosticsPanel so on-device users (no DevTools)
 * can see and copy the same events that useDualSpeech's ttsDebug logs.
 *
 * Captures unconditionally (small memory footprint) so the panel always has
 * data. The localStorage "tts-debug" flag continues to govern console logging.
 */

const MAX_EVENTS = 100;
const events = [];
const listeners = new Set();

export function pushTtsEvent(name, data) {
  events.push({ ts: Date.now(), name, data });
  if (events.length > MAX_EVENTS) events.shift();
  listeners.forEach((cb) => {
    try { cb(); } catch { /* ignore listener errors */ }
  });
}

export function getTtsEvents() {
  return events.slice();
}

export function clearTtsEvents() {
  events.length = 0;
  listeners.forEach((cb) => {
    try { cb(); } catch { /* ignore listener errors */ }
  });
}

export function subscribeTtsEvents(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
