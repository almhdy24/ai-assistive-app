import { useEffect, useRef } from "react";
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

export default function Home({
  t,
  onVoiceCommand,
  listening,
  speaking,
  speechSupported,
  voiceCommand,
  lastCommandLanguage,
}) {
  const navigate = useNavigate();
  const haptics = useHaptics();
  const lang = lastCommandLanguage || "ar";
  const mountedCmdId = useRef(voiceCommand?.id ?? null);

  useEffect(() => {
    announce(pick(t.homeWelcome, "ar"), {
      priority: SPEAK_PRIORITY.LOW,
      language: "ar",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!voiceCommand) return;
    if (voiceCommand.id === mountedCmdId.current) return;
    const { type } = voiceCommand;

    if (type === "stop") {
      window.dispatchEvent(new CustomEvent("ai-assistive:stop-speak"));
      return;
    }
    if (type === "back" || type === "home") return;

    const route = ROUTE_BY_COMMAND[type];
    if (route) {
      navigate(route, {
        state: { viaVoice: true, command: type, commandLanguage: lang },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceCommand]);

  let voiceState = "idle";
  if (!speechSupported) voiceState = "unsupported";
  else if (speaking) voiceState = "speaking";
  else if (listening) voiceState = "listening";

  const shortcuts = [
    { to: "/object-detection", ar: pick(t.objectDetection, "ar"), en: pick(t.objectDetection, "en") },
    { to: "/read-text",        ar: pick(t.readText, "ar"),        en: pick(t.readText, "en") },
    { to: "/scene-description", ar: pick(t.sceneDescription, "ar"), en: pick(t.sceneDescription, "en") },
    { to: "/navigation",       ar: pick(t.navigation, "ar"),      en: pick(t.navigation, "en") },
  ];

  return (
    <div className="screen screen--home">
      <main className="home-content" id="main-content" tabIndex="-1">

        <header className="home-brand">
          <h1 className="home-brand-title">{pick(t.appName, lang)}</h1>
          <p className="home-brand-sub">{pick(t.tellMeWhatYouNeed, lang)}</p>
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
          </p>
        </div>

        {/* Secondary: feature shortcuts */}
        <nav
          className="home-grid"
          aria-label={lang === "ar" ? "الخدمات" : "Features"}
        >
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="feature-card"
              aria-label={`${s.ar} — ${s.en}`}
              onClick={() => haptics.tap()}
            >
              <strong className="feature-card-title">{s.ar}</strong>
              {s.en && <span className="feature-card-title-en">{s.en}</span>}
            </Link>
          ))}
        </nav>

        <InstallPrompt t={t} />
      </main>
    </div>
  );
}
