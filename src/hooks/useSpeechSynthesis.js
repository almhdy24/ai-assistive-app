import { useCallback, useEffect, useRef, useState } from "react";

function splitText(text, maxLength = 220) {
  if (!text) {
    return [];
  }

  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?؟。])\s+/)
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxLength) {
      current = `${current} ${sentence}`.trim();
    } else {
      if (current) {
        chunks.push(current);
      }

      current = sentence;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function useSpeechSynthesis(language) {
  const [speaking, setSpeaking] = useState(false);
  const keepAliveRef = useRef(null);

  const stop = useCallback(() => {
    if (!window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    setSpeaking(false);

    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text) => {
      if (!text || !window.speechSynthesis) {
        return false;
      }

      stop();

      const chunks = splitText(text);

      if (!chunks.length) {
        return false;
      }

      let index = 0;

      const speakNext = () => {
        if (index >= chunks.length) {
          setSpeaking(false);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);

        utterance.lang = language === "ar" ? "ar-SA" : "en-US";
        utterance.rate = language === "ar" ? 0.88 : 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onend = () => {
          index += 1;
          speakNext();
        };

        utterance.onerror = () => {
          setSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
      };

      setSpeaking(true);

      keepAliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      speakNext();

      return true;
    },
    [language, stop]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    speak,
    stop,
    speaking,
    supported: "speechSynthesis" in window,
  };
}
