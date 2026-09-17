import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const speechSupported = Boolean(SpeechRecognitionCtor);
export const synthesisSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * useSpeech — unified voice I/O for the whole app.
 *
 * - Keeps recognition alive (auto-restarts after every utterance).
 * - Pauses recognition while TTS is speaking so we don't hear ourselves.
 * - Splits long text into sentence-sized chunks (mobile browsers silently
 *   truncate utterances longer than ~300 chars).
 */
export function useSpeech({ language, onCommand }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const restartTimer = useRef(null);
  const speakIdRef = useRef(0);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const recognitionLang =
    language === "ar" ? "ar-SA" : "en-US";

  /* -------- Recognition -------- */

  const stopRecognition = useCallback(() => {
    clearTimeout(restartTimer.current);
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    if (!speechSupported || !language) return;
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.start();
    } catch {
      /* already started */
    }
  }, [language]);

  const scheduleRestart = useCallback(() => {
    clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      startRecognition();
    }, 500);
  }, [startRecognition]);

  useEffect(() => {
    if (!speechSupported || !language) return;

    const recognition = new SpeechRecognitionCtor();

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.lang = recognitionLang;

    recognition.onstart = () => setListening(true);

    recognition.onend = () => {
      setListening(false);
      /* Keep the mic open — this is a voice-first app. */
      scheduleRestart();
    };

    recognition.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setListening(false);
        return;
      }
      if (event.error === "no-speech") return;
      scheduleRestart();
    };

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last.isFinal) return;

      const transcript = last[0].transcript?.trim();
      if (transcript && onCommandRef.current) {
        onCommandRef.current(transcript);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      /* ignore */
    }

    return () => {
      recognitionRef.current = null;
      clearTimeout(restartTimer.current);
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, speechSupported]);

  /* -------- Synthesis -------- */

  const speakChunk = useCallback(
    (text) =>
      new Promise((resolve) => {
        if (!synthesisSupported || !text) {
          resolve();
          return;
        }

        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = recognitionLang;
        utt.rate = language === "ar" ? 0.88 : 0.92;
        utt.pitch = 1;
        utt.volume = 1;

        /* Prefer a native voice when the browser offers one */
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) =>
            v.lang?.startsWith(language === "ar" ? "ar" : "en") &&
            v.localService
        );
        if (preferred) utt.voice = preferred;

        const id = speakIdRef.current;

        /* Chrome/Android silently stops after ~15s — nudge it */
        const keepAlive = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(keepAlive);
            return;
          }
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }, 10000);

        const finish = () => {
          clearInterval(keepAlive);
          if (id === speakIdRef.current) {
            setSpeaking(false);
            scheduleRestart();
          }
          resolve();
        };

        utt.onend = finish;
        utt.onerror = finish;

        setSpeaking(true);
        stopRecognition();
        window.speechSynthesis.speak(utt);
      }),
    [language, recognitionLang, scheduleRestart, stopRecognition]
  );

  const speak = useCallback(
    async (text) => {
      if (!text) return;

      const chunks = text
        .split(/(?<=[.!?؟\n])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const chunk of chunks) {
        await speakChunk(chunk);
      }
    },
    [speakChunk]
  );

  const stopSpeaking = useCallback(() => {
    speakIdRef.current += 1;
    if (synthesisSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
    scheduleRestart();
  }, [scheduleRestart]);

  const toggleListening = useCallback(() => {
    if (listening) stopRecognition();
    else startRecognition();
  }, [listening, startRecognition, stopRecognition]);

  return {
    listening,
    speaking,
    speak,
    stopSpeaking,
    toggleListening,
    startRecognition,
    stopRecognition,
  };
}
