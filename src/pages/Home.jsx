import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import InstallPrompt from "../components/InstallPrompt";
import { useHaptics } from "../hooks/useHaptics";
import { announce, SPEAK_PRIORITY } from "../utils/a11y";
import { pick } from "../i18n/translations";

const ROUTE_BY_COMMAND = {
  "visual-question": "/object-detection",
  "object-detection": "/object-detection",
  right: "/object-detection",
  left: "/object-detection",
  "read-text": "/read-text",
  "scene-description": "/scene-description",
  navigation: "/navigation",
};

const SHORTCUTS = [
  {
    to: "/object-detection",
    icon: "◉",
    arKey: "objectDetection",
    enKey: "objectDetection",
    hint: { ar: "ماذا أمامي", en: "What's around me" },
  },
  {
    to: "/read-text",
    icon: "≡",
    arKey: "readText",
    enKey: "readText",
    hint: { ar: "اقرأ النص", en: "Read text" },
  },
  {
    to: "/scene-description",
    icon: "⌂",
    arKey: "sceneDescription",
    enKey: "sceneDescription",
    hint: { ar: "صف المكان", en: "Describe scene" },
  },
  {
    to: "/navigation",
    icon: "→",
    arKey: "navigation",
    enKey: "navigation",
    hint: { ar: "ساعدني في التنقل", en: "Help me navigate" },
  },
];

export default function Home({
  t,
  onVoiceCommand,
  listening,
  speaking,
  speechSupported,
  synthesisSupported = true,
  micPermission = "unknown",
  onRequestMicPermission,
  voiceCommand,
  lastCommandLanguage,
}) {
  const navigate = useNavigate();
  const haptics = useHaptics();
  const lang = lastCommandLanguage || "ar";
  const mountedCmdId = useRef(voiceCommand?.id ?? null);

  function switchLanguage(next = lang === "ar" ? "en" : "ar") {
    haptics.tap();
    window.dispatchEvent(new CustomEvent("ai-assistive:set-language", { detail: { language: next } }));
  }

  const [lastHeard, setLastHeard] = useState(null);
  const heardTimerRef = useRef(null);
  const notUnderstoodCooldownRef = useRef(0);

  useEffect(() => {
    announce(pick(t.homeWelcome, lang), {
      priority: SPEAK_PRIORITY.LOW,
      language: lang,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!voiceCommand) return;
    if (voiceCommand.id === mountedCmdId.current) return;
    const { type, transcript } = voiceCommand;

    // Show what was heard for 4 seconds (helpful for caregivers)
    if (transcript) {
      setLastHeard(transcript);
      clearTimeout(heardTimerRef.current);
      heardTimerRef.current = setTimeout(() => setLastHeard(null), 4000);
    }

    if (type === "stop") {
      window.dispatchEvent(new CustomEvent("ai-assistive:stop-speak"));
      return;
    }
    if (type === "lang-en") return switchLanguage("en");
    if (type === "lang-ar") return switchLanguage("ar");
    if (type === "back" || type === "home") return;

    const route = ROUTE_BY_COMMAND[type];
    if (route) {
      navigate(route, {
        state: { viaVoice: true, command: type, commandLanguage: lang },
      });
    } else {
      const now = Date.now();
      if (
        transcript?.trim().length > 2 &&
        now - notUnderstoodCooldownRef.current > 4000
      ) {
        notUnderstoodCooldownRef.current = now;
        announce(pick(t.notUnderstoodHome, lang), {
          priority: SPEAK_PRIORITY.NORMAL,
          language: lang,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceCommand]);

  useEffect(() => () => clearTimeout(heardTimerRef.current), []);

  let voiceState = "idle";
  if (!speechSupported) voiceState = "unsupported";
  else if (micPermission === "denied") voiceState = "denied";
  else if (speaking) voiceState = "speaking";
  else if (listening) voiceState = "listening";

  const showTtsWarning = !synthesisSupported;
  const showMicWarning = speechSupported && micPermission === "denied";
  const showSrWarning = !speechSupported;

  return (
    <div className="screen screen--home">
      <main className="home-content" id="main-content" tabIndex="-1">

        <header className="home-brand">
          <div className="home-brand-text">
            <h1 className="home-brand-title">{pick(t.appName, lang)}</h1>
            <p className="home-brand-sub">{pick(t.tellMeWhatYouNeed, lang)}</p>
          </div>
          <button
            type="button"
            className="home-lang-btn"
            onClick={() => switchLanguage()}
            aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
          >
            {lang === "ar" ? "EN" : "AR"}
          </button>
        </header>

        {/* Primary: voice button */}
        <div className="home-voice-area">
          <button
            type="button"
            className={`home-voice-btn home-voice-btn--${voiceState}`}
            onClick={() => {
              haptics.tap();
              if (typeof onVoiceCommand === "function") onVoiceCommand();
            }}
            disabled={!speechSupported || speaking}
            aria-label={
              voiceState === "listening"
                ? pick(t.listening, lang)
                : pick(t.voiceCommand, lang)
            }
            aria-pressed={listening}
          >
            <span className="home-voice-ring" aria-hidden="true" />
            <span className="home-voice-dot" aria-hidden="true">
              {listening ? "●" : "◉"}
            </span>
          </button>

          <p
            className="home-voice-label"
            aria-live="polite"
            aria-atomic="true"
          >
            {voiceState === "listening" && pick(t.listening, lang)}
            {voiceState === "speaking" && pick(t.speaking, lang)}
            {voiceState === "idle" && pick(t.voiceCommand, lang)}
            {voiceState === "unsupported" && pick(t.speechUnavailable, lang)}
            {voiceState === "denied" && pick(t.microphonePermission, lang)}
          </p>

          {lastHeard && (
            <p className="home-heard" aria-live="off" aria-hidden="true">
              {lastHeard}
            </p>
          )}

          {(showMicWarning || showSrWarning || showTtsWarning) && (
            <div
              className="home-support-warn"
              role="alert"
              aria-live="assertive"
            >
              {showSrWarning && <p>{pick(t.speechUnavailable, lang)}</p>}
              {showMicWarning && (
                <>
                  <p>{pick(t.microphonePermission, lang)}</p>
                  <p>{pick(t.microphonePermissionAction, lang)}</p>
                  {onRequestMicPermission && (
                    <button
                      type="button"
                      className="home-support-btn"
                      onClick={async () => {
                        haptics.tap();
                        await onRequestMicPermission();
                      }}
                    >
                      {pick(t.microphoneRetry, lang)}
                    </button>
                  )}
                </>
              )}
              {showTtsWarning && <p>{pick(t.synthesisUnavailable, lang)}</p>}
            </div>
          )}
        </div>

        {/* Secondary: feature shortcuts */}
        <nav
          className="home-grid"
          aria-label={lang === "ar" ? "الخدمات" : "Features"}
        >
          {SHORTCUTS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="feature-card"
              aria-label={`${pick(t[s.arKey], "ar")} — ${pick(t[s.enKey], "en")}`}
              onClick={() => haptics.tap()}
            >
              <span className="feature-card-icon" aria-hidden="true">{s.icon}</span>
              <strong className="feature-card-title">{pick(t[s.arKey], lang)}</strong>
              <span className="feature-card-hint">{pick(s.hint, lang)}</span>
            </Link>
          ))}
        </nav>

        <InstallPrompt t={t} />
      </main>
    </div>
  );
}
