import { useCallback, useEffect, useRef, useState } from "react";

import { SPEAK_PRIORITY } from "../utils/a11y";
import { primaryLanguage as detectPrimaryLang } from "../utils/languageDetect";
import { chunkBySentence } from "../utils/arabicTts";

const Ctor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const speechSupported = Boolean(Ctor);
export const synthesisSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

const LANG_CODE = { ar: "ar-SA", en: "en-US" };
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
 * @param {string|null} opts.language - "ar" | "en" | null (null = detection mode)
 */
export function useDualSpeech({ enabled = true, onCommand, language = null }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastCommandLanguage, setLastCommandLanguage] = useState(language || "ar");
  // "granted" | "denied" | "prompt" | "unknown"
  const [micPermission, setMicPermission] = useState("unknown");

  const recognizersRef = useRef({});
  const restartTimersRef = useRef({});
  const pausedRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  // Tracks the post-command 1600ms restart timer so language changes can cancel it
  const commandRestartTimerRef = useRef(null);

  // Factory stored in ref so startAllRecognition/scheduleRestart can always
  // create fresh instances (Android Chrome can't reliably restart a stopped recognizer)
  const makeRecognizerRef = useRef(null);

  const queueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const playingGenRef = useRef(0);

  const activeLangs = language ? [LANG_CODE[language]] : ALL_LANGS;
  const activeLangsRef = useRef(activeLangs);
  activeLangsRef.current = activeLangs;

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (language) setLastCommandLanguage(language);
  }, [language]);

  // Proactive permission probe — some browsers expose the current state without
  // triggering a prompt. If denied, we can surface it before rec.start() fails silently.
  useEffect(() => {
    if (!speechSupported) return;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status;
    const onChange = () => setMicPermission(status?.state || "unknown");
    navigator.permissions
      .query({ name: "microphone" })
      .then((s) => {
        status = s;
        setMicPermission(s.state);
        s.addEventListener?.("change", onChange);
      })
      .catch(() => { /* permissions API not available for microphone in this browser */ });
    return () => {
      status?.removeEventListener?.("change", onChange);
    };
  }, []);

  const requestMicPermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only need the prompt — SpeechRecognition manages its own mic
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      return true;
    } catch {
      setMicPermission("denied");
      return false;
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Recognition                                                      */
  /* ---------------------------------------------------------------- */

  const scheduleRestart = useCallback((lang) => {
    if (!activeLangsRef.current.includes(lang)) return;
    clearTimeout(restartTimersRef.current[lang]);
    restartTimersRef.current[lang] = setTimeout(() => {
      if (pausedRef.current) return;
      const make = makeRecognizerRef.current;
      if (make) {
        try { recognizersRef.current[lang]?.abort(); } catch { /* ignore */ }
        const rec = make(lang);
        recognizersRef.current[lang] = rec;
        try { rec.start(); } catch { /* ignore */ }
      } else {
        try { recognizersRef.current[lang]?.start(); } catch { /* ignore */ }
      }
    }, 450);
  }, []);

  const stopAllRecognition = useCallback(() => {
    pausedRef.current = true;
    ALL_LANGS.forEach((lang) => {
      clearTimeout(restartTimersRef.current[lang]);
      // .abort() releases the mic immediately; .stop() waits for a final
      // result which on Huawei EMUI keeps the audio session hot long enough
      // to collide with the TTS output and produce distorted "screaming".
      try { recognizersRef.current[lang]?.abort(); } catch { /* ignore */ }
    });
    setListening(false);
  }, []);

  // Use the ref (not closure) so stale advance()/timer closures created before a
  // language change still start the CURRENT-language recognizer, not the old one.
  const startAllRecognition = useCallback(() => {
    pausedRef.current = false;
    activeLangsRef.current.forEach((lang) => {
      const make = makeRecognizerRef.current;
      if (make) {
        // Always create a fresh instance — Android Chrome can't reliably restart
        // a SpeechRecognition object that was previously .stop()ed
        try { recognizersRef.current[lang]?.abort(); } catch { /* ignore */ }
        const rec = make(lang);
        recognizersRef.current[lang] = rec;
        try { rec.start(); } catch { /* ignore */ }
      } else {
        try { recognizersRef.current[lang]?.start(); } catch { /* ignore */ }
      }
    });
  }, []);

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
      const entry = pending[LANG_CODE[language]];
      if (!entry?.transcript) return;
      transcript = entry.transcript;
      detected = language;
    } else {
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
      try { recognizersRef.current[l]?.abort(); } catch { /* ignore */ }
    });
    setListening(false);

    setLastCommandLanguage(detected);
    onCommandRef.current?.(transcript, detected);

    commandRestartTimerRef.current = setTimeout(() => {
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
    if (!speechSupported || !enabled) {
      makeRecognizerRef.current = null;
      return;
    }

    const makeRecognizer = (lang) => {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = language ? 3 : 5;
      rec.lang = lang;

      rec.onstart = () => {
        // Reaching onstart means the OS granted mic access to this recognizer
        setMicPermission("granted");
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
          // Surface the denied state so the UI can show recovery instructions.
          // Do NOT auto-restart: a denied recognizer will just error again.
          setMicPermission("denied");
          pausedRef.current = true;
          setListening(false);
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

      return rec;
    };

    makeRecognizerRef.current = makeRecognizer;

    // Only reset paused if TTS is idle — if TTS is playing, advance() will call
    // startAllRecognition() when done, which properly resets pausedRef then.
    if (!isPlayingRef.current) {
      pausedRef.current = false;
    }
    activeLangs.forEach((lang) => {
      const rec = makeRecognizer(lang);
      recognizersRef.current[lang] = rec;
      try { rec.start(); } catch { /* ignore */ }
    });

    return () => {
      makeRecognizerRef.current = null;
      pausedRef.current = true;
      // Cancel the post-command restart timer — if language is changing, the
      // stale timer would call the old-language startAllRecognition and start
      // the wrong recognizer, which can echo-loop into TTS ("screaming")
      clearTimeout(commandRestartTimerRef.current);
      clearTimeout(flushTimerRef.current);
      ALL_LANGS.forEach((lang) => {
        clearTimeout(restartTimersRef.current[lang]);
        try { recognizersRef.current[lang]?.stop(); } catch { /* ignore */ }
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
    // Always abort recognizers before speaking — even if pausedRef is true,
    // Huawei may still be holding the mic from a recognizer that was only
    // .stop()ed. Idempotent abort() is cheap and forces the audio session free.
    stopAllRecognition();
    setSpeaking(true);

    const gen = ++playingGenRef.current;

    const utt = new SpeechSynthesisUtterance(next.text);
    utt.lang = next.language === "ar" ? "ar-SA" : "en-US";
    utt.rate = next.language === "ar" ? 0.88 : 0.9;
    utt.pitch = 1;
    utt.volume = 1;

    let keepAlive = null;
    const clearKeepAlive = () => {
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    };

    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      clearKeepAlive();
      if (gen !== playingGenRef.current) return; // stale — superseded
      isPlayingRef.current = false;

      if (queueRef.current.length > 0) {
        playNext();
      } else {
        setSpeaking(false);
        if (!pausedRef.current) {
          pausedRef.current = false;
          startAllRecognition();
        }
      }
    };

    utt.onstart = () => {
      if (gen !== playingGenRef.current || advanced) return;
      clearKeepAlive();
      keepAlive = setInterval(() => {
        if (gen !== playingGenRef.current || advanced) {
          clearKeepAlive();
          return;
        }
        try {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } catch { /* ignore */ }
      }, 10000);
    };
    utt.onend = advance;
    utt.onerror = advance;

    // Give the Huawei audio driver time to actually release the mic after
    // recognizer .abort() before speak() opens the TTS output channel.
    // Synchronous cancel+speak worked in the standalone (which had at most
    // one recognizer); this app runs dual-language recognition, doubling the
    // mic contention. 250ms is small enough to feel snappy.
    setTimeout(() => {
      if (gen !== playingGenRef.current) return; // superseded before we got a chance
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      try { window.speechSynthesis.speak(utt); } catch { /* ignore */ }
    }, 250);
  }, [startAllRecognition, stopAllRecognition]);

  const speak = useCallback(
    (text, { priority = SPEAK_PRIORITY.NORMAL, language: langOverride } = {}) => {
      if (!text || !synthesisSupported) return;

      const lang = langOverride || (language ?? detectPrimaryLang(text, "ar"));

      if (priority === SPEAK_PRIORITY.CRITICAL && isPlayingRef.current) {
        // Invalidate in-flight callbacks before canceling
        playingGenRef.current++;
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        isPlayingRef.current = false;
        queueRef.current = [];
      }

      const chunks = chunkBySentence(text, lang);
      chunks.forEach((chunk) =>
        queueRef.current.push({ text: chunk, priority, language: lang })
      );
      queueRef.current.sort((a, b) => a.priority - b.priority);

      playNext();
    },
    [language, playNext]
  );

  const stopSpeaking = useCallback(() => {
    playingGenRef.current++;
    queueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
    if (synthesisSupported) window.speechSynthesis.cancel();
    pausedRef.current = false;
    startAllRecognition();
  }, [startAllRecognition]);

  const stopAll = useCallback(() => {
    playingGenRef.current++;
    queueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
    if (synthesisSupported) window.speechSynthesis.cancel();

    pausedRef.current = true;
    ALL_LANGS.forEach((lang) => {
      clearTimeout(restartTimersRef.current[lang]);
      try { recognizersRef.current[lang]?.stop(); } catch { /* ignore */ }
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
    micPermission,
    synthesisSupported,
    speechSupported,
    requestMicPermission,
  };
}
