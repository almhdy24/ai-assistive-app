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
// When no language is locked (initial VoiceLanguageSelector screen), default the
// recognizer to Arabic. Users still have the on-screen AR/EN tap buttons.
const DEFAULT_REC_LANG = "ar-SA";

/**
 * Combined speech-recognition + TTS hook.
 *
 * @param {object} opts
 * @param {boolean}  opts.enabled
 * @param {function} opts.onCommand   - called with (transcript, language)
 * @param {string|null} opts.language - "ar" | "en" | null (null → default Arabic recognizer)
 */
export function useDualSpeech({ enabled = true, onCommand, language = null }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastCommandLanguage, setLastCommandLanguage] = useState(language || "ar");
  // "granted" | "denied" | "prompt" | "unknown"
  const [micPermission, setMicPermission] = useState("unknown");

  // Single-recognizer refs — the hook always runs at most one recognizer at a
  // time. Running dual recognizers doubles the mic contention on Android
  // vendor ROMs (e.g. Huawei EMUI), which colllides with TTS output.
  const recognizerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const commandRestartTimerRef = useRef(null);
  const pausedRef = useRef(false);
  const onCommandRef = useRef(onCommand);

  // Factory stored in ref so timers/callbacks can always create fresh instances
  // (Android Chrome can't reliably restart a stopped recognizer).
  const makeRecognizerRef = useRef(null);

  const queueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const playingGenRef = useRef(0);
  const ttsWarmedRef = useRef(false);

  const voicesRef = useRef({ ar: null, en: null });

  // Recognizer BCP-47 code — falls back to Arabic when no locked language.
  const recLang = language ? LANG_CODE[language] : DEFAULT_REC_LANG;
  const recLangRef = useRef(recLang);
  recLangRef.current = recLang;

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (language) setLastCommandLanguage(language);
  }, [language]);

  // Proactive permission probe — some browsers expose the current state without
  // triggering a prompt. If denied, we surface it before rec.start() fails silently.
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

  useEffect(() => {
    if (!synthesisSupported) return;
    const refresh = () => {
      voicesRef.current.ar = pickBestVoice("ar");
      voicesRef.current.en = pickBestVoice("en");
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    // Safety net: on Android Chrome, voiceschanged can fire before the listener
    // is added (voices already cached). Retry once to pick them up.
    const t = setTimeout(refresh, 500);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
      clearTimeout(t);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Recognition                                                      */
  /* ---------------------------------------------------------------- */

  const scheduleRestart = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (pausedRef.current) return;
      const make = makeRecognizerRef.current;
      if (!make) return;
      try { recognizerRef.current?.abort(); } catch { /* ignore */ }
      const rec = make(recLangRef.current);
      recognizerRef.current = rec;
      try { rec.start(); } catch { /* ignore */ }
    }, 450);
  }, []);

  const stopRecognition = useCallback(() => {
    pausedRef.current = true;
    clearTimeout(restartTimerRef.current);
    clearTimeout(commandRestartTimerRef.current);
    // .abort() releases the mic immediately; .stop() waits for a final result
    // which on Huawei EMUI keeps the audio session hot long enough to collide
    // with TTS output.
    try { recognizerRef.current?.abort(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    pausedRef.current = false;
    clearTimeout(restartTimerRef.current);
    const make = makeRecognizerRef.current;
    if (!make) return;
    // Always create a fresh instance — Android Chrome can't reliably restart
    // a SpeechRecognition object that was previously .stop()ed.
    try { recognizerRef.current?.abort(); } catch { /* ignore */ }
    const rec = make(recLangRef.current);
    recognizerRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }, []);

  const pendingRef = useRef(null);
  const flushTimerRef = useRef(null);

  const flushPending = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p?.transcript) return;

    // Trust the recognizer's language when locked; fall back to script-based
    // detection when unlocked (VoiceLanguageSelector uses matchLanguageIntent
    // downstream on the transcript, so this "detected" value is advisory).
    const detected = language || detectPrimaryLang(p.transcript, "ar");

    pausedRef.current = true;
    clearTimeout(restartTimerRef.current);
    try { recognizerRef.current?.abort(); } catch { /* ignore */ }
    setListening(false);

    setLastCommandLanguage(detected);
    onCommandRef.current?.(p.transcript, detected);

    clearTimeout(commandRestartTimerRef.current);
    commandRestartTimerRef.current = setTimeout(() => {
      // Skip if TTS is active — advance() will restart recognition after last chunk
      if (!isPlayingRef.current) {
        pausedRef.current = false;
        startRecognition();
      }
    }, 1600);
  }, [language, startRecognition]);

  const scheduleFlush = useCallback(() => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPending, 600);
  }, [flushPending]);

  // Rebuild recognizer whenever enabled or language changes
  useEffect(() => {
    if (!speechSupported || !enabled) {
      makeRecognizerRef.current = null;
      return;
    }

    const makeRecognizer = (lang) => {
      const rec = new Ctor();
      // continuous=false: the recognizer ends after a single final result.
      // This matches the known-good pattern — we restart from onend when idle,
      // which is more reliable on Android Chrome than continuous=true (some
      // vendor ROMs stop dispatching results after the first utterance in
      // continuous mode).
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.lang = lang;

      // Ignore onstart/onend/onerror on instances we've already replaced.
      // startRecognition and scheduleRestart abort the current recognizer
      // before creating a new one; the aborted instance's handlers fire
      // asynchronously — if we don't check "am I still the current recognizer?"
      // we schedule a restart against the freshly-started recognizer, which
      // aborts it, which fires another stale onend, and so on — infinite loop.
      const isCurrent = () => recognizerRef.current === rec;

      rec.onstart = () => {
        // Reaching onstart means the OS granted mic access to this recognizer
        setMicPermission("granted");
        if (!pausedRef.current && isCurrent()) setListening(true);
      };
      rec.onend = () => {
        if (!isCurrent()) return;
        // continuous=false ends immediately after a final result. If we have
        // a queued transcript, deliver it now instead of waiting out the 600ms
        // debounce — the recognizer has already committed, no more results
        // will arrive on this instance.
        if (pendingRef.current) {
          clearTimeout(flushTimerRef.current);
          flushPending();
          return;
        }
        // Only auto-restart when we're idle. If TTS is playing or the command
        // flow is running, playNext/advance/flushPending own the restart.
        if (!pausedRef.current && !isPlayingRef.current) scheduleRestart();
      };
      rec.onerror = (event) => {
        if (!isCurrent()) return;
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
        // .abort() fires onerror with "aborted"/"canceled" — deliberate; ignore
        // so we don't schedule a redundant restart on top of the caller's flow.
        if (event.error === "aborted" || event.error === "canceled") return;
        scheduleRestart();
      };
      rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (!last.isFinal) return;

        for (let i = 0; i < last.length; i++) {
          const alt = last[i];
          const t = alt.transcript?.trim();
          if (!t) continue;

          const confidence = alt.confidence || 0;
          const prev = pendingRef.current;
          if (!prev || confidence > prev.confidence) {
            pendingRef.current = { transcript: t, confidence };
          }
        }

        scheduleFlush();
      };

      return rec;
    };

    makeRecognizerRef.current = makeRecognizer;

    // Only reset paused if TTS is idle — if TTS is playing, advance() will call
    // startRecognition() when done, which properly resets pausedRef then.
    if (!isPlayingRef.current) {
      pausedRef.current = false;
    }
    const rec = makeRecognizer(recLang);
    recognizerRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }

    return () => {
      makeRecognizerRef.current = null;
      pausedRef.current = true;
      // Cancel any pending timers — a stale timer would call the old-language
      // startRecognition and start the wrong recognizer, which can echo-loop
      // into TTS ("screaming").
      clearTimeout(commandRestartTimerRef.current);
      clearTimeout(flushTimerRef.current);
      clearTimeout(restartTimerRef.current);
      try { recognizerRef.current?.abort(); } catch { /* ignore */ }
      recognizerRef.current = null;
    };
    // language change restarts the recognizer with the new lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, recLang, scheduleRestart, scheduleFlush, flushPending]);

  /* ---------------------------------------------------------------- */
  /* Synthesis                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Fires a silent priming utterance to unlock the TTS engine. Many Android
   * TTS engines cold-start on the first speak() call and the first audible
   * utterance is delayed, clipped, or distorted. A muted primer avoids that.
   *
   * MUST be called from within a user-gesture handler on browsers that gate
   * speech synthesis behind a gesture (iOS Safari, some Android WebViews).
   * Idempotent — subsequent calls are no-ops for the session.
   */
  const warmUpTts = useCallback(() => {
    if (!synthesisSupported) return;
    if (ttsWarmedRef.current) return;
    ttsWarmedRef.current = true;
    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      primer.rate = 1;
      primer.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(primer);
    } catch {
      // A warm-up failure should never break the app. Reset the gate so a
      // later attempt can try again.
      ttsWarmedRef.current = false;
    }
  }, []);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    isPlayingRef.current = true;
    // Always abort the recognizer before speaking — even if pausedRef is true,
    // Huawei may still be holding the mic. Idempotent abort() is cheap and
    // forces mic release before the TTS output channel opens.
    stopRecognition();
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
    utt.rate = rate;
    // Android TTS engines are sensitive to non-default pitch — force 1.0
    utt.pitch = IS_ANDROID ? 1.0 : pitch;
    utt.volume = volume;

    // Inter-chunk gap: Android audio-session release is slower on some vendor
    // ROMs (e.g. Huawei EMUI). If the next utterance starts before the previous
    // one's session has released, they overlap and sound distorted ("screaming").
    const nextGap = IS_ANDROID
      ? (next.language === "ar" ? 260 : 220)
      : (next.language === "ar" ? 100 : 80);

    // Guard so advance() can only run once per utterance. Previously, if the
    // engine misreported `!speaking` briefly between chunks AND then fired the
    // real onend, both paths would schedule playNext() → two overlapping
    // utterances on Huawei devices.
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      if (gen !== playingGenRef.current) return; // stale — superseded by stop/cancel
      if (watchdog) clearInterval(watchdog);
      isPlayingRef.current = false;

      if (queueRef.current.length > 0) {
        // Keep speaking=true; restart recognition only after the last chunk
        setTimeout(playNext, nextGap);
      } else {
        setSpeaking(false);
        pausedRef.current = false;
        startRecognition();
      }
    };

    // Minimal watchdog: ONLY the hard 13-second cap (Android's 15s TTS budget
    // silently cuts audio; we cancel before that so onerror("canceled") can
    // continue the queue). We do NOT force-advance on !speaking and do NOT
    // call ss.resume() — those paths cause overlapping utterances on Huawei
    // EMUI, since the engine transiently flips paused/speaking between
    // phonemes, and forcing resume/advance schedules a duplicate playback.
    let watchdog = null;
    const startTime = Date.now();
    watchdog = setInterval(() => {
      if (gen !== playingGenRef.current) {
        clearInterval(watchdog);
        return;
      }
      if (Date.now() - startTime > 13000) {
        clearInterval(watchdog);
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
    }, 500);

    utt.onend = () => advance();
    utt.onerror = () => {
      if (gen !== playingGenRef.current) return; // stale
      if (watchdog) clearInterval(watchdog);
      // Treat every error path through advance() so the idempotent guard applies.
      if (advanced) return;
      advanced = true;
      isPlayingRef.current = false;

      if (queueRef.current.length > 0) {
        setTimeout(playNext, nextGap);
      } else {
        setSpeaking(false);
        if (!pausedRef.current) {
          pausedRef.current = false;
          startRecognition();
        }
      }
    };

    // Give the Huawei audio driver time to actually release the mic after
    // recognizer .abort() before speak() opens the TTS output channel.
    setTimeout(() => {
      if (gen !== playingGenRef.current) return; // superseded before we got a chance
      try { window.speechSynthesis.speak(utt); } catch { /* ignore */ }
    }, 250);
  }, [startRecognition, stopRecognition]);

  const speak = useCallback(
    (text, { priority = SPEAK_PRIORITY.NORMAL, language: langOverride } = {}) => {
      if (!text || !synthesisSupported) return;

      const lang = langOverride || (language ?? detectPrimaryLang(text, "ar"));

      let needsCancelDelay = false;

      if (priority === SPEAK_PRIORITY.CRITICAL && isPlayingRef.current) {
        // Invalidate in-flight watchdog/callbacks before canceling
        playingGenRef.current++;
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        isPlayingRef.current = false;
        queueRef.current = [];
        needsCancelDelay = true;
      } else if (!isPlayingRef.current && queueRef.current.length === 0) {
        // Unconditional cancel before starting a fresh queue — clears any
        // stale synthesis state that may not be visible from the JS event stream.
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }

      const chunks = chunkForSpeech(text, lang);
      chunks.forEach((chunk) =>
        queueRef.current.push({ text: chunk, priority, language: lang })
      );
      queueRef.current.sort((a, b) => a.priority - b.priority);

      // Give the audio session time to release after cancel() before starting
      // the next utterance — Android vendor ROMs need more time than desktop.
      if (needsCancelDelay) {
        setTimeout(playNext, IS_ANDROID ? 260 : 80);
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
    if (synthesisSupported) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    pausedRef.current = false;
    startRecognition();
  }, [startRecognition]);

  const stopAll = useCallback(() => {
    playingGenRef.current++;
    queueRef.current = [];
    isPlayingRef.current = false;
    setSpeaking(false);
    if (synthesisSupported) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    pausedRef.current = true;
    clearTimeout(restartTimerRef.current);
    clearTimeout(commandRestartTimerRef.current);
    try { recognizerRef.current?.abort(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  /**
   * Voice-button handler.
   *
   * - If TTS is currently speaking: barge in — cancel the utterance queue and
   *   start listening immediately. Users tapping the mic during an assistant
   *   response are signaling "I want to talk now"; making them wait feels broken.
   * - Otherwise: toggle between listening and idle.
   */
  const toggleListening = useCallback(() => {
    if (isPlayingRef.current || speaking) {
      // Barge-in: cancel TTS state, then start listening in the same tick.
      playingGenRef.current++;
      queueRef.current = [];
      isPlayingRef.current = false;
      setSpeaking(false);
      if (synthesisSupported) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
      // Clear any post-command restart timer so it doesn't stomp our fresh start
      clearTimeout(commandRestartTimerRef.current);
      startRecognition();
      return;
    }
    if (listening) stopRecognition();
    else startRecognition();
  }, [listening, speaking, startRecognition, stopRecognition]);

  return {
    listening,
    speaking,
    lastCommandLanguage,
    speak,
    stopSpeaking,
    stopAll,
    toggleListening,
    warmUpTts,
    startRecognition,
    stopRecognition,
    micPermission,
    synthesisSupported,
    speechSupported,
    requestMicPermission,
  };
}
