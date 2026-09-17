import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import CameraView from "../components/CameraView";
import { useCamera } from "../hooks/useCamera";
import { useHaptics } from "../hooks/useHaptics";
import { analyzeImage } from "../services/gemini";
import { announce, cancelSpeaking, SPEAK_PRIORITY } from "../utils/a11y";
import { pick, voiceGuides } from "../i18n/translations";

const MODE_BY_COMMAND = {
  "visual-question": "general",
  "object-detection": "general",
  right: "right",
  left: "left",
  "read-text": "text",
  "scene-description": "scene",
  navigation: "navigation",
};

// Route for each command type — used for cross-page navigation
const ROUTE_BY_TYPE = {
  "visual-question": "/object-detection",
  "object-detection": "/object-detection",
  right: "/object-detection",
  left: "/object-detection",
  "read-text": "/read-text",
  "scene-description": "/scene-description",
  navigation: "/navigation",
};

const ERROR_KEY_BY_CODE = {
  "camera-permission": "cameraPermission",
  "camera-not-found": "cameraNotFound",
  "camera-in-use": "cameraInUse",
  "camera-constraints": "cameraConstraints",
  "camera-unsupported": "cameraUnsupported",
  "camera-unknown": "cameraUnknown",
};

export default function VisionPage({
  t,
  mode,
  title,
  voiceCommand,
  lastCommandLanguage = "ar",
}) {
  const navigate = useNavigate();
  const haptics = useHaptics();

  const {
    videoRef,
    active,
    ready,
    status,
    errorCode,
    start,
    stop,
    capture,
  } = useCamera();

  const [result, setResult] = useState("");
  const [resultLanguage, setResultLanguage] = useState(lastCommandLanguage);
  const [analysisError, setAnalysisError] = useState("");
  const [loading, setLoading] = useState(false);

  const controllerRef = useRef(null);
  const readyAnnouncedRef = useRef(false);
  const mountedCmdId = useRef(voiceCommand?.id ?? null);
  const notUnderstoodCooldownRef = useRef(0);

  const lang = lastCommandLanguage || "ar";
  const titleText = pick(title, lang);
  const modeGuide =
    voiceGuides.modePrompts[mode]?.[lang] ||
    voiceGuides.modePrompts.general[lang];

  useEffect(() => {
    start();
    return () => {
      stop();
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) {
      readyAnnouncedRef.current = false;
      return;
    }
    if (readyAnnouncedRef.current) return;
    readyAnnouncedRef.current = true;

    haptics.ready();

    setTimeout(() => {
      announce(`${titleText}. ${modeGuide}`, {
        priority: SPEAK_PRIORITY.HIGH,
        language: lang,
      });
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (status !== "error" || !errorCode) return;
    const k = ERROR_KEY_BY_CODE[errorCode];
    if (!k) return;
    haptics.error();
    announce(pick(t[k], lang), {
      priority: SPEAK_PRIORITY.CRITICAL,
      language: lang,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, errorCode]);

  const runAnalyze = useCallback(async () => {
    if (loading) return;

    const image = capture();
    if (!image) {
      haptics.error();
      announce(pick(t.cameraStarting, lang), {
        priority: SPEAK_PRIORITY.HIGH,
        language: lang,
      });
      return;
    }

    haptics.tap();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setResult("");
    setAnalysisError("");
    setResultLanguage(lang);

    announce(pick(t.scanning, lang), {
      priority: SPEAK_PRIORITY.LOW,
      language: lang,
    });

    try {
      const text = await analyzeImage({
        image,
        mode,
        language: lang,
        signal: controller.signal,
      });

      setResult(text);
      haptics.success();

      announce(`${text}. ${pick(voiceGuides.afterResult, lang)}`, {
        priority: SPEAK_PRIORITY.HIGH,
        language: lang,
      });
    } catch (error) {
      // axios + AbortController throws CanceledError
      if (error.name === "AbortError" || error.name === "CanceledError" || error.code === "ERR_CANCELED") return;
      const msg =
        error.code === "NETWORK_REQUIRED"  ? pick(t.networkRequired, lang)
        : error.code === "NO_API_KEY"      ? pick(t.invalidKey, lang)
        : error.code === "RATE_LIMITED"    ? pick(t.rateLimited, lang)
        : error.code === "QUOTA_EXCEEDED"  ? pick(t.quotaExceeded, lang)
        : error.code === "INVALID_KEY"     ? pick(t.invalidKey, lang)
        : error.message                    || pick(t.analysisFailed, lang);
      setAnalysisError(msg);
      haptics.error();
      announce(msg, { priority: SPEAK_PRIORITY.CRITICAL, language: lang });
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  }, [capture, loading, mode, lang, t, haptics]);

  const handleRepeat = useCallback(() => {
    if (!result) return;
    haptics.tap();
    announce(result, {
      priority: SPEAK_PRIORITY.CRITICAL,
      language: resultLanguage,
    });
  }, [result, resultLanguage, haptics]);

  const handleReset = useCallback(() => {
    haptics.tap();
    setResult("");
    setAnalysisError("");
    setLoading(false);
    controllerRef.current?.abort();
    if (!active) start();
  }, [active, start, haptics]);

  useEffect(() => {
    if (!voiceCommand) return;
    if (voiceCommand.id === mountedCmdId.current) return; // stale — was active before this page mounted
    const { type, language: cmdLang } = voiceCommand;
    const cmdLanguage = cmdLang || lang;

    if (type === "stop") {
      window.dispatchEvent(new CustomEvent("ai-assistive:stop-speak"));
      controllerRef.current?.abort();
      setLoading(false);
      return;
    }
    if (type === "lang-en" || type === "lang-ar") {
      const next = type === "lang-en" ? "en" : "ar";
      try { localStorage.setItem("language", next); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    if (type === "repeat") return handleRepeat();
    if (type === "back") {
      cancelSpeaking();
      return navigate(-1);
    }
    if (type === "home") {
      cancelSpeaking();
      return navigate("/", { replace: true });
    }

    const requestedMode = MODE_BY_COMMAND[type];
    if (requestedMode) {
      if (requestedMode === mode && !loading && ready) {
        setResultLanguage(cmdLanguage);
        runAnalyze();
      } else if (requestedMode !== mode && ROUTE_BY_TYPE[type]) {
        // Command targets a different page — navigate there instead of ignoring it
        cancelSpeaking();
        navigate(ROUTE_BY_TYPE[type]);
      }
    } else {
      const now = Date.now();
      if (
        voiceCommand.transcript?.trim().length > 2 &&
        now - notUnderstoodCooldownRef.current > 4000
      ) {
        notUnderstoodCooldownRef.current = now;
        announce(pick(t.notUnderstoodPage, cmdLanguage), {
          priority: SPEAK_PRIORITY.NORMAL,
          language: cmdLanguage,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceCommand]);

  const errorKey = errorCode ? ERROR_KEY_BY_CODE[errorCode] : null;
  const permissionMessage = errorKey ? pick(t[errorKey], lang) : "";

  let phase = "ready";
  if (status === "prompting") phase = "starting";
  else if (permissionMessage) phase = "error";
  else if (loading) phase = "thinking";
  else if (result) phase = "result";

  return (
    <div className="vision">
      <CameraView
        videoRef={videoRef}
        active={active}
        ready={ready}
        capturedImage={null}
        ariaLabel={`${pick(title, "ar")} — ${pick(title, "en")}`}
      />

      {/* Top bar */}
      <div className="vision__bar vision__bar--top">
        <button
          type="button"
          className="vision__btn"
          onClick={() => {
            haptics.tap();
            cancelSpeaking();
            navigate(-1);
          }}
          aria-label="رجوع / Back"
        >
          ←
        </button>

        <div className="vision__mode" aria-hidden="true">
          <span className="vision__mode-dot" />
          <span>{pick(title, lang)}</span>
        </div>

        <button
          type="button"
          className="vision__btn"
          onClick={() => {
            haptics.tap();
            cancelSpeaking();
            navigate("/", { replace: true });
          }}
          aria-label="الرئيسية / Home"
        >
          ⌂
        </button>
      </div>

      {/* Center status — the ONLY moving piece */}
      <div className="vision__center" data-phase={phase}>
        <div className="vision__halo">
          <span className="vision__halo-ring" />
          <span className="vision__halo-dot" />
        </div>
      </div>

      {/* Scan line — only shown while reading text */}
      {mode === "text" && phase === "thinking" && (
        <div className="vision__scan-line" aria-hidden="true" />
      )}

      {/* Voice guide */}
      <div className="vision__hint" aria-hidden="true">
        {phase === "starting" && pick(t.cameraStarting, lang)}
        {phase === "ready" && modeGuide}
        {phase === "thinking" && mode === "text" && (lang === "ar" ? "جارٍ قراءة النص…" : "Reading text…")}
        {phase === "thinking" && mode !== "text" && pick(t.processing, lang)}
        {phase === "result" && pick(voiceGuides.afterResult, lang)}
        {phase === "error" && permissionMessage}
      </div>

      {/* Shutter */}
      <div className="vision__bar vision__bar--bottom">
        <button
          type="button"
          className="vision__shutter"
          onClick={runAnalyze}
          disabled={!ready || loading}
          aria-label={`${pick(t.analyze, "ar")} / ${pick(t.analyze, "en")}`}
        >
          <span className="vision__shutter-ring" aria-hidden="true" />
          <span className="vision__shutter-dot" aria-hidden="true" />
        </button>
      </div>

      {/* Result sheet */}
      {result && (
        <div className="sheet" role="region" aria-live="polite">
          <div className="sheet__handle" aria-hidden="true" />

          <p
            className="sheet__text"
            dir={resultLanguage === "ar" ? "rtl" : "ltr"}
            lang={resultLanguage}
          >
            {result}
          </p>

          <div className="sheet__actions">
            <button
              type="button"
              className="sheet__btn"
              onClick={handleRepeat}
            >
              {pick(t.repeat, lang)}
            </button>
            <button
              type="button"
              className="sheet__btn sheet__btn--primary"
              onClick={handleReset}
            >
              {pick(t.analyzeAgain, lang)}
            </button>
          </div>
        </div>
      )}

      {analysisError && (
        <div className="sheet sheet--error" role="alert">
          <p className="sheet__error">{analysisError}</p>
        </div>
      )}
    </div>
  );
}
