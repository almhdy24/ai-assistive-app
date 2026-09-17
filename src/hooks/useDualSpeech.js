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

// On Android Chrome, assigning utt.voice makes the engine simultaneously play
// the requested voice AND a fallback while the voice loads — causing distorted
// "screaming" output. Setting only utt.lang lets the OS route to the correct
// TTS engine cleanly.
const IS_ANDROID =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

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

  const voicesRef = useRef({ ar: null, en: null });

  const activeLangs = language ? [LANG_CODE[language]] : ALL_LANGS;

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (language) setLastCommandLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!synthesisSupported) return;
    const refresh = () => {
      voicesRef.current.ar = pickBestVoice("ar");
      voicesRef.current.en = pickBestVoice("en");
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    // Safety net: on Android Chrome, voiceschanged can fire before the listener is
    // added (voices already cached). Retry once to pick them up.
    const t = setTimeout(refresh, 500);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
      clearTimeout(t);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Recognition                                                      */
  /* ---------------------------------------------------------------- */

  const scheduleRestart = useCallback((lang) => {
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
      try { recognizersRef.current[lang]?.stop(); } catch { /* ignore */ }
    });
    setListening(false);
  }, []);

  const startAllRecognition = useCallback(() => {
    pausedRef.current = false;
    activeLangs.forEach((lang) => {
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
      try { recognizersRef.current[l]?.stop(); } catch { /* ignore */ }
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

    // Reset paused state — language change means a clean restart
    pausedRef.current = false;
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
    if (!pausedRef.current) stopAllRecognition();
    setSpeaking(true);

    const gen = ++playingGenRef.current;

    // On Android: never assign utt.voice — let utt.lang route to the OS TTS.
    // On other platforms: re-validate the cached voice against the live list
    // so stale objects don't cause a double-play fallback.
    const voice = IS_ANDROID
      ? null
      : (() => {
          const allVoices = window.speechSynthesis.getVoices();
          const cached = voicesRef.current[next.language];
          const v =
            cached && allVoices.some((v) => v.name === cached.name)
              ? cached
              : pickBestVoice(next.language);
          if (v) voicesRef.current[next.language] = v;
          return v;
        })();

    const { rate, pitch, volume } = getSpeakParams(next.language, voice);

    const utt = new SpeechSynthesisUtterance(next.text);
    if (voice) utt.voice = voice;
    utt.lang = next.language === "ar" ? "ar-SA" : "en-US";
    // Android TTS engines are sensitive to non-default pitch — force 1.0
    utt.rate = rate;
    utt.pitch = IS_ANDROID ? 1.0 : pitch;
    utt.volume = volume;

    // Watchdog instead of pause/resume keep-alive.
    // pause/resume was breaking onend on Android Chrome, leaving isPlayingRef=true
    // forever and making the app appear frozen. The watchdog instead:
    //   1. Detects silent TTS death (speaking goes false without onend firing)
    //   2. Forces advance past any chunk stuck >13s (Android 15s TTS budget limit)
    //   3. Auto-resumes if browser paused TTS due to audio focus change
    let watchdog = null;
    let idleCount = 0;
    const startTime = Date.now();

    const advance = () => {
      if (gen !== playingGenRef.current) return; // stale — superseded by stop/cancel
      if (watchdog) clearInterval(watchdog);
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

    watchdog = setInterval(() => {
      if (gen !== playingGenRef.current) {
        clearInterval(watchdog);
        return;
      }

      const ss = window.speechSynthesis;

      // Resume if browser auto-paused (audio focus loss, interruption, etc.)
      if (ss.paused) {
        ss.resume();
        idleCount = 0;
        return;
      }

      if (!ss.speaking) {
        // TTS ended (or died silently) without firing onend
        if (++idleCount >= 3) { // 750ms debounce prevents false positives between chunks
          clearInterval(watchdog);
          advance();
        }
      } else {
        idleCount = 0;
        // Hard 13s cap: force cancel if stuck (Android 15s TTS budget)
        // onerror("canceled") will continue the queue
        if (Date.now() - startTime > 13000) {
          clearInterval(watchdog);
          ss.cancel();
        }
      }
    }, 250);

    utt.onend = advance;
    utt.onerror = (evt) => {
      if (gen !== playingGenRef.current) return; // stale
      if (watchdog) clearInterval(watchdog);
      isPlayingRef.current = false;

      if (evt.error === "interrupted" || evt.error === "canceled") {
        if (queueRef.current.length > 0) {
          // Genuine external interruption with chunks remaining — try to continue
          setTimeout(playNext, 100);
        } else {
          setSpeaking(false);
          // stopSpeaking (cancel-speak) leaves pausedRef false → restart recognition
          // stopAll (stop-speak) leaves pausedRef true → stay paused
          if (!pausedRef.current) startAllRecognition();
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

      let needsCancelDelay = false;

      if (priority === SPEAK_PRIORITY.CRITICAL && isPlayingRef.current) {
        // Invalidate in-flight watchdog/callbacks before canceling
        playingGenRef.current++;
        window.speechSynthesis.cancel();
        isPlayingRef.current = false;
        queueRef.current = [];
        needsCancelDelay = true;
      } else if (!isPlayingRef.current && queueRef.current.length === 0) {
        // Fresh session: cancel any stale browser utterances left from a previous
        // session (Android Chrome can resume old utterances after foregrounding)
        window.speechSynthesis.cancel();
        needsCancelDelay = true;
      }

      const chunks = chunkForSpeech(text, lang);
      chunks.forEach((chunk) =>
        queueRef.current.push({ text: chunk, priority, language: lang })
      );
      queueRef.current.sort((a, b) => a.priority - b.priority);

      // Give the audio session time to release after cancel() before starting
      // the next utterance — Android needs more time than desktop browsers
      if (needsCancelDelay) {
        setTimeout(playNext, IS_ANDROID ? 160 : 80);
      } else {
        playNext();
      }
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
  };
}
