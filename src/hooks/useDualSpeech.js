import { useCallback, useEffect, useRef, useState } from "react";

import { SPEAK_PRIORITY } from "../utils/a11y";
import { primaryLanguage as detectPrimaryLang } from "../utils/languageDetect";
import {
  chunkForSpeech,
  getSpeakParams,
  pickBestVoice,
} from "../utils/arabicTts";

const Ctor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const speechSupported = Boolean(Ctor);
export const synthesisSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

// Full lang codes for each short code
const LANG_CODE = { ar: "ar-SA", en: "en-US" };
// Fallback: both when no language selected (detection phase)
const ALL_LANGS = ["ar-SA", "en-US"];

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/;
const LATIN_RE = /[A-Za-z]/;

function scriptOf(text) {
  const hasAr = ARABIC_RE.test(text);
  const hasEn = LATIN_RE.test(text);
  if (hasAr && !hasEn) return "ar";
  if (hasEn && !hasAr) return "en";
  if (hasAr && hasEn) {
    const ar = (text.match(ARABIC_RE) || []).length;
    const en = (text.match(LATIN_RE) || []).length;
    return ar >= en ? "ar" : "en";
  }
  return null;
}

/**
 * @param {object} opts
 * @param {boolean}  opts.enabled
 * @param {function} opts.onCommand   - called with (transcript, language)
 * @param {string|null} opts.language - "ar" | "en" | null (null = detection mode, runs both)
 */
export function useDualSpeech({ enabled = true, onCommand, language = null }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastCommandLanguage, setLastCommandLanguage] = useState(language || "ar");

  const recognizersRef = useRef({});
  const restartTimersRef = useRef({});
  const pausedRef = useRef(false);
  const onCommandRef = useRef(onCommand);

  const queueRef = useRef([]);
  const isPlayingRef = useRef(false);

  const voicesRef = useRef({ ar: null, en: null });

  // Active recognizer lang codes — one when language is set, both when detecting
  const activeLangs = language ? [LANG_CODE[language]] : ALL_LANGS;

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Keep lastCommandLanguage in sync when language prop changes
  useEffect(() => {
    if (language) setLastCommandLanguage(language);
  }, [language]);

  // Warm voice cache
  useEffect(() => {
    if (!synthesisSupported) return;

    const refresh = () => {
      voicesRef.current.ar = pickBestVoice("ar");
      voicesRef.current.en = pickBestVoice("en");
    };

    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Recognition                                                      */
  /* ---------------------------------------------------------------- */

  const scheduleRestart = useCallback(
    (lang) => {
      clearTimeout(restartTimersRef.current[lang]);
      restartTimersRef.current[lang] = setTimeout(() => {
        if (pausedRef.current) return;
        try {
          recognizersRef.current[lang]?.start();
        } catch {
          /* already running */
        }
      }, 450);
    },
    []
  );

  const stopAllRecognition = useCallback(() => {
    pausedRef.current = true;
    ALL_LANGS.forEach((lang) => {
      clearTimeout(restartTimersRef.current[lang]);
      try {
        recognizersRef.current[lang]?.stop();
      } catch {
        /* ignore */
      }
    });
    setListening(false);
  }, []);

  const startAllRecognition = useCallback(() => {
    pausedRef.current = false;
    // Only start the active language(s)
    activeLangs.forEach((lang) => {
      try {
        recognizersRef.current[lang]?.start();
      } catch {
        /* ignore */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const pendingRef = useRef({});
  const flushTimerRef = useRef(null);

  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = {};

    const candidates = Object.entries(pending);
    if (!candidates.length) return;

    let transcript;
    let detected;

    if (language) {
      // Single-language mode: just use the result directly
      const entry = pending[LANG_CODE[language]];
      if (!entry?.transcript) return;
      transcript = entry.transcript;
      detected = language;
    } else {
      // Dual-language detection mode: score candidates and pick winner
      const scored = candidates.map(([lang, { transcript: t, confidence }]) => {
        const script = scriptOf(t);
        const scriptMatches =
          (lang.startsWith("ar") && script === "ar") ||
          (lang.startsWith("en") && script === "en");

        const scriptRatio =
          script === "ar"
            ? (t.match(ARABIC_RE) || []).length / t.length
            : (t.match(LATIN_RE) || []).length / t.length;

        return {
          lang: lang.startsWith("ar") ? "ar" : "en",
          transcript: t,
          score:
            (scriptMatches ? 0.5 : 0) +
            scriptRatio * 0.35 +
            (confidence || 0.5) * 0.15,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      const winner = scored[0];
      if (!winner?.transcript) return;
      transcript = winner.transcript;
      detected = detectPrimaryLang(winner.transcript, winner.lang);
    }

    pausedRef.current = true;
    ALL_LANGS.forEach((l) => {
      clearTimeout(restartTimersRef.current[l]);
      try {
        recognizersRef.current[l]?.stop();
      } catch {
        /* ignore */
      }
    });
    setListening(false);

    setLastCommandLanguage(detected);
    onCommandRef.current?.(transcript, detected);

    setTimeout(() => {
      // Skip if TTS is active — advance() will restart recognition after last chunk
      if (!isPlayingRef.current) {
        pausedRef.current = false;
        startAllRecognition();
      }
    }, 1600);
  }, [language, startAllRecognition]);

  const scheduleFlush = useCallback(() => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPending, 600);
  }, [flushPending]);

  // Rebuild recognizers whenever enabled or language changes
  useEffect(() => {
    if (!speechSupported || !enabled) return;

    activeLangs.forEach((lang) => {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = language ? 3 : 5;
      rec.lang = lang;

      rec.onstart = () => {
        if (!pausedRef.current) setListening(true);
      };

      rec.onend = () => {
        if (!pausedRef.current) scheduleRestart(lang);
      };

      rec.onerror = (event) => {
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          return;
        }
        if (event.error === "no-speech") return;
        scheduleRestart(lang);
      };

      rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (!last.isFinal) return;

        for (let i = 0; i < last.length; i++) {
          const alt = last[i];
          const t = alt.transcript?.trim();
          if (!t) continue;

          // In dual mode, reject mismatched scripts
          if (!language) {
            const script = scriptOf(t);
            const expected = lang.startsWith("ar") ? "ar" : "en";
            if (script && script !== expected) continue;
          }

          const confidence = alt.confidence || 0;
          const prev = pendingRef.current[lang];
          if (!prev || confidence > prev.confidence) {
            pendingRef.current[lang] = { transcript: t, confidence };
          }
        }

        scheduleFlush();
      };

      recognizersRef.current[lang] = rec;

      try {
        rec.start();
      } catch {
        /* ignore */
      }
    });

    return () => {
      pausedRef.current = true;
      clearTimeout(flushTimerRef.current);
      ALL_LANGS.forEach((lang) => {
        clearTimeout(restartTimersRef.current[lang]);
        try {
          recognizersRef.current[lang]?.stop();
        } catch {
          /* ignore */
        }
      });
      recognizersRef.current = {};
    };
    // language change restarts recognizers with the right set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, language, scheduleRestart, scheduleFlush]);

  /* ---------------------------------------------------------------- */
  /* Synthesis                                                        */
  /* ---------------------------------------------------------------- */

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    isPlayingRef.current = true;
    if (!pausedRef.current) stopAllRecognition();
    setSpeaking(true);

    const voice = voicesRef.current[next.language];
    const { rate, pitch, volume } = getSpeakParams(next.language, voice);

    const utt = new SpeechSynthesisUtterance(next.text);
    if (voice) utt.voice = voice;
    utt.lang = next.language === "ar" ? "ar-SA" : "en-US";
    utt.rate = rate;
    utt.pitch = pitch;
    utt.volume = volume;

    // Chrome/Android stops TTS silently after ~15 s — nudge it every 10 s
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);

    const advance = () => {
      clearInterval(keepAlive);
      isPlayingRef.current = false;

      if (queueRef.current.length > 0) {
        // Keep speaking=true; restart recognition only after the last chunk
        setTimeout(playNext, next.language === "ar" ? 100 : 80);
      } else {
        setSpeaking(false);
        pausedRef.current = false;
        startAllRecognition();
      }
    };

    utt.onend = advance;
    utt.onerror = (evt) => {
      clearInterval(keepAlive);
      isPlayingRef.current = false;

      if (evt.error === "interrupted" || evt.error === "canceled") {
        if (queueRef.current.length > 0) {
          // Keep-alive pause/resume side-effect with chunks still pending — continue
          setTimeout(playNext, 100);
        } else {
          // Queue was cleared by stopSpeaking/stopAll — caller handles recognition state
          setSpeaking(false);
        }
        return;
      }

      // Any other error: skip chunk and continue
      if (queueRef.current.length > 0) {
        setTimeout(playNext, 100);
      } else {
        setSpeaking(false);
        pausedRef.current = false;
        startAllRecognition();
      }
    };

    window.speechSynthesis.speak(utt);
  }, [startAllRecognition, stopAllRecognition]);

  const speak = useCallback(
    (text, { priority = SPEAK_PRIORITY.NORMAL, language: langOverride } = {}) => {
      if (!text || !synthesisSupported) return;

      const lang = langOverride || (language ?? detectPrimaryLang(text, "ar"));

      if (priority === SPEAK_PRIORITY.CRITICAL && isPlayingRef.current) {
        window.speechSynthesis.cancel();
        isPlayingRef.current = false;
        queueRef.current = [];
      }

      const chunks = chunkForSpeech(text, lang);
      chunks.forEach((chunk) =>
        queueRef.current.push({ text: chunk, priority, language: lang })
      );
      queueRef.current.sort((a, b) => a.priority - b.priority);
      playNext();
    },
    [language, playNext]
  );

  const stopSpeaking = useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
    if (synthesisSupported) window.speechSynthesis.cancel();
    pausedRef.current = false;
    startAllRecognition();
  }, [startAllRecognition]);

  const stopAll = useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
    if (synthesisSupported) window.speechSynthesis.cancel();

    pausedRef.current = true;
    ALL_LANGS.forEach((lang) => {
      clearTimeout(restartTimersRef.current[lang]);
      try {
        recognizersRef.current[lang]?.stop();
      } catch {
        /* ignore */
      }
    });
    setListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) stopAllRecognition();
    else startAllRecognition();
  }, [listening, startAllRecognition, stopAllRecognition]);

  return {
    listening,
    speaking,
    lastCommandLanguage,
    speak,
    stopSpeaking,
    stopAll,
    toggleListening,
    startRecognition: startAllRecognition,
    stopRecognition: stopAllRecognition,
  };
}
