import { useCallback, useEffect, useState } from "react";

import {
  clearTtsEvents,
  getTtsEvents,
  subscribeTtsEvents,
} from "../utils/ttsDiagnostics";

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function formatTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatEvent(evt) {
  const time = formatTime(evt.ts);
  let dataStr = "";
  if (evt.data !== undefined && evt.data !== null) {
    try {
      dataStr = " " + JSON.stringify(evt.data);
    } catch {
      dataStr = " [unserializable]";
    }
  }
  return `[${time}] ${evt.name}${dataStr}`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function TtsDiagnosticsPanel({ open, onClose }) {
  const [events, setEvents] = useState(() => getTtsEvents());
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    // Enable the console-logging side of ttsDebug while the panel is open,
    // so a developer with adb logcat can also see the same events live.
    try { localStorage.setItem("tts-debug", "1"); } catch { /* ignore */ }
    setEvents(getTtsEvents());
    const unsub = subscribeTtsEvents(() => setEvents(getTtsEvents()));
    return unsub;
  }, [open]);

  const handleCopy = useCallback(async () => {
    const header = [
      `TTS diagnostics — ${new Date().toISOString()}`,
      `UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      `Events: ${events.length}`,
      "----",
    ].join("\n");
    const body = events.length ? events.map(formatEvent).join("\n") : "(no events)";
    const ok = await copyText(`${header}\n${body}`);
    setCopyStatus(ok ? "copied" : "failed");
    setTimeout(() => setCopyStatus(""), 1500);
  }, [events]);

  const handleClear = useCallback(() => {
    clearTtsEvents();
    setEvents([]);
  }, []);

  if (!open) return null;

  const copyLabel =
    copyStatus === "copied"
      ? "Copied ✓"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy";

  return (
    <div
      className="tts-diag-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="TTS diagnostics"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tts-diag">
        <div className="tts-diag-header">
          <h2 className="tts-diag-title">TTS diagnostics</h2>
          <button
            type="button"
            className="tts-diag-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="tts-diag-actions">
          <button type="button" className="tts-diag-btn" onClick={handleCopy}>
            {copyLabel}
          </button>
          <button type="button" className="tts-diag-btn" onClick={handleClear}>
            Clear
          </button>
          <button
            type="button"
            className="tts-diag-btn tts-diag-btn--secondary"
            onClick={onClose}
          >
            Close
          </button>
          <span className="tts-diag-count">{events.length}/100</span>
        </div>

        <pre className="tts-diag-log" dir="ltr">
          {events.length === 0
            ? "No events yet. Close this, trigger some speech (e.g. tap the mic or open Object Detection and capture a photo), then reopen."
            : events.map(formatEvent).join("\n")}
        </pre>
      </div>
    </div>
  );
}
