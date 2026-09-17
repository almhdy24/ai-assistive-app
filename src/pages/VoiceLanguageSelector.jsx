import { useCallback, useEffect, useRef, useState } from "react";

import { matchLanguageIntent } from "../utils/languageDetect";
import { useHaptics } from "../hooks/useHaptics";
import { SPEAK_PRIORITY } from "../utils/a11y";

/**
 * Voice-first language selection.
 *
 * Flow:
 *   1. Big "tap to begin" gate — needed once so iOS grants mic + TTS.
 *   2. Spoken greeting in both languages asking the user to say
 *      "عربي" or "English".
 *   3. The picker listens for both Arabic and English intents.
 *   4. On a match: confirms in that language, haptic success, calls
 *      `onSelect(lang)`.
 *   5. On no match: politely re-asks; after 9s of silence, re-prompts.
 */

const GREETING =
  "مرحباً بك في المساعد البصري. قل: عربي، لاستخدام اللغة العربية. " +
  "For English, say: English.";

const REPROMPT_AR = "لم أفهم. قل: عربي، أو: English.";
const REPROMPT_SILENT =
  "لم أسمع رداً. قل: عربي، أو: English.";

const CONFIRM = {
  ar: "تم اختيار اللغة العربية. جاهز.",
  en: "English selected. Ready.",
};

export default function VoiceLanguageSelector({
  onSelect,
  speak,
  speakText, // optional override for testing
  intent, // { intent: "ar" | "en" | null, transcript, id }
}) {
  const haptics = useHaptics();

  const [phase, setPhase] = useState("gate"); // gate | listening | unknown | confirming
  const [attempts, setAttempts] = useState(0);

  const confirmTimerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const announcedRef = useRef(null);
  const lastIntentIdRef = useRef(null);

  const say = useCallback(
    (text, language, priority = SPEAK_PRIORITY.HIGH) => {
      if (speakText) {
        speakText(text, language);
        return;
      }
      speak?.(text, { language, priority });
    },
    [speak, speakText]
  );

  /* -------- Begin after the user taps the gate -------- */

  const begin = useCallback(() => {
    haptics.tap();
    setPhase("listening");
    setAttempts(0);

    /* Greeting — long enough that we give the user time to listen */
    say(GREETING, "ar", SPEAK_PRIORITY.HIGH);
  }, [haptics, say]);

  /* -------- React to voice intents from App -------- */

  useEffect(() => {
    if (!intent) return;
    if (intent.id === lastIntentIdRef.current) return;
    lastIntentIdRef.current = intent.id;

    /* If we're still on the gate, ignore — user must tap first */
    if (phase === "gate" || phase === "confirming") return;

    const matched = intent.intent || matchLanguageIntent(intent.transcript);

    if (!matched) {
      setPhase("unknown");
      setAttempts((n) => n + 1);
      haptics.warning();

      const msg =
        attempts >= 1 ? REPROMPT_SILENT : REPROMPT_AR;
      say(msg, "ar", SPEAK_PRIORITY.CRITICAL);

      setTimeout(() => setPhase("listening"), 2400);
      return;
    }

    /* Language matched */
    setPhase("confirming");
    haptics.success();
    say(CONFIRM[matched], matched, SPEAK_PRIORITY.HIGH);

    confirmTimerRef.current = setTimeout(() => {
      onSelect(matched);
    }, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, phase]);

  /* -------- Re-prompt on silence -------- */

  useEffect(() => {
    if (phase !== "listening") return;

    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (phase !== "listening") return;
      setAttempts((n) => n + 1);
      haptics.warning();
      say(REPROMPT_SILENT, "ar", SPEAK_PRIORITY.HIGH);
    }, 9000);

    return () => clearTimeout(silenceTimerRef.current);
  }, [phase, say, haptics]);

  /* -------- Announce the initial gate via TTS -------- */

  useEffect(() => {
    if (phase !== "gate") return;
    if (announcedRef.current === "gate") return;
    announcedRef.current = "gate";
  }, [phase]);

  /* -------- Tap fallback (WCAG: never rely on one modality) -------- */

  const pickByTap = useCallback(
    (lang) => {
      if (phase === "confirming") return;
      haptics.tap();
      setPhase("confirming");
      say(CONFIRM[lang], lang, SPEAK_PRIORITY.HIGH);
      confirmTimerRef.current = setTimeout(() => onSelect(lang), 1400);
    },
    [phase, haptics, say, onSelect]
  );

  /* -------- Cleanup -------- */

  useEffect(
    () => () => {
      clearTimeout(confirmTimerRef.current);
      clearTimeout(silenceTimerRef.current);
    },
    []
  );

  /* -------- Render -------- */

  return (
    <main
      className="language-screen"
      id="main-content"
      role="main"
      aria-labelledby="voice-language-title"
    >
      <section className="language-box">
        <div className="brand-mark" aria-hidden="true">
          AI
        </div>

        <h1 id="voice-language-title" className="language-title">
          <span dir="rtl" lang="ar">
            اختر اللغة
          </span>
          <span className="bilingual-alt" dir="ltr" lang="en">
            Choose your language
          </span>
        </h1>

        <p
          className="language-hint"
          aria-live="polite"
          aria-atomic="true"
        >
          {phase === "gate" && (
            <>
              <span dir="rtl" lang="ar">
                اضغط للبدء، ثم قل: عربي، أو English
              </span>
              <span className="bilingual-alt" dir="ltr" lang="en">
                Tap to begin, then say: Arabic or English
              </span>
            </>
          )}

          {phase === "listening" && (
            <>
              <span dir="rtl" lang="ar">
                جاري الاستماع… قل: عربي، أو English
              </span>
              <span className="bilingual-alt" dir="ltr" lang="en">
                Listening… say: Arabic or English
              </span>
            </>
          )}

          {phase === "unknown" && (
            <>
              <span dir="rtl" lang="ar">
                لم أفهم. حاول مرة أخرى.
              </span>
              <span className="bilingual-alt" dir="ltr" lang="en">
                I didn't catch that. Try again.
              </span>
            </>
          )}

          {phase === "confirming" && (
            <>
              <span dir="rtl" lang="ar">
                جاري التجهيز…
              </span>
              <span className="bilingual-alt" dir="ltr" lang="en">
                Getting ready…
              </span>
            </>
          )}
        </p>

        {phase === "gate" ? (
          <button
            type="button"
            className="language-start"
            onClick={begin}
            aria-label="اضغط للبدء — Tap to begin"
          >
            <span className="language-start-icon" aria-hidden="true">
              ◉
            </span>
            <span className="language-start-text">
              <span dir="rtl" lang="ar">
                اضغط للبدء
              </span>
              <span
                className="bilingual-alt"
                dir="ltr"
                lang="en"
              >
                Tap to begin
              </span>
            </span>
          </button>
        ) : (
          <div
            className={`language-pulse ${
              phase === "listening" ? "is-active" : ""
            }`}
            aria-hidden="true"
          >
            <span className="pulse-ring" />
            <span className="pulse-dot" />
          </div>
        )}

        <div className="language-actions">
          <button
            type="button"
            className="language-btn"
            onClick={() => pickByTap("ar")}
            lang="ar"
            aria-label="العربية — استخدام التطبيق بالعربية"
          >
            العربية
          </button>

          <button
            type="button"
            className="language-btn"
            onClick={() => pickByTap("en")}
            lang="en"
            aria-label="English — use the app in English"
          >
            English
          </button>
        </div>
      </section>
    </main>
  );
}
