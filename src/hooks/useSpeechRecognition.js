import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeechRecognition(language, onResult) {
  const recognitionRef = useRef(null);
  const callbackRef = useRef(onResult);
  const shouldListenRef = useRef(false);

  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    callbackRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setSupported(false);
      return undefined;
    }

    const recognition = new Recognition();

    recognition.lang = language === "ar" ? "ar-SA" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      const result = event.results?.[0]?.[0]?.transcript;

      if (result) {
        callbackRef.current(result);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      shouldListenRef.current = false;
    };

    recognition.onend = () => {
      setListening(false);
      shouldListenRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;

      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }

      recognitionRef.current = null;
    };
  }, [language]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition || listening) {
      return false;
    }

    try {
      shouldListenRef.current = true;
      recognition.start();
      return true;
    } catch {
      shouldListenRef.current = false;
      return false;
    }
  }, [listening]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch {
      // Already stopped.
    }

    setListening(false);
  }, []);

  return {
    start,
    stop,
    listening,
    supported,
  };
}
